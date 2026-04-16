pub mod api;
mod keychain;
pub mod sync;
mod tray;

use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tokio::sync::{watch, Mutex as AsyncMutex};

use api::client::SelfboxClient;
use api::types::{BootstrapResult, ChangesResult, DeviceTicket, WorkspaceSummary};
use sync::engine::SyncEngine;
use sync::manifest::SyncManifest;
use sync::watcher::FsWatcher;

/// Shared app state accessible from Tauri commands.
struct AppState {
    client: StdMutex<Option<SelfboxClient>>,
    /// Engine is held in an async mutex because commands (and the
    /// background sync loop) hold the lock across `.await`.
    engine: Arc<AsyncMutex<Option<SyncEngine>>>,
    /// Watcher is an async mutex too so `drain_events` can run without
    /// fighting the engine lock.
    watcher: Arc<AsyncMutex<Option<FsWatcher>>>,
    local_root: StdMutex<Option<String>>,
    server_url: StdMutex<Option<String>>,
    /// Handle to the background sync loop task. We keep it so a re-run
    /// of start_sync can shut down any prior loop before starting a new one.
    loop_shutdown: StdMutex<Option<watch::Sender<bool>>>,
}

#[derive(Serialize, Clone)]
struct SyncStatusPayload {
    state: String,
    message: String,
    cursor: i64,
}

// ── Tauri commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
fn get_default_sync_root() -> String {
    dirs::home_dir()
        .map(|h| h.join("Selfbox").to_string_lossy().to_string())
        .unwrap_or_else(|| "~/Selfbox".into())
}

/// Open a native folder picker, return the chosen path (or null if cancelled).
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose Selfbox Sync Folder")
        .pick_folder(move |path| {
            let _ = tx.send(path.and_then(|p| p.as_path().map(|p| p.to_string_lossy().to_string())));
        });
    rx.await.ok().flatten()
}

#[tauri::command]
fn save_tokens_to_keychain(access_token: String, refresh_token: String) -> Result<(), String> {
    keychain::save_tokens(&access_token, &refresh_token)
}

#[tauri::command]
fn load_tokens_from_keychain() -> Option<(String, String)> {
    keychain::load_tokens()
}

#[tauri::command]
fn clear_tokens_from_keychain() -> Result<(), String> {
    keychain::clear_tokens()
}

#[tauri::command]
fn configure_client(server_url: String, access_token: String, state: State<AppState>) {
    let mut client = SelfboxClient::new(&server_url);
    client.set_token(access_token);
    *state.client.lock().unwrap() = Some(client);
    *state.server_url.lock().unwrap() = Some(server_url);
}

/// Swap in a freshly-refreshed bearer token on the live sync engine's
/// client. Called by the frontend after it handles an `auth:expired`
/// event — the engine continues with the new token on the next
/// push/poll tick without needing a full restart.
#[tauri::command]
async fn update_engine_access_token(
    access_token: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut guard = state.engine.lock().await;
    if let Some(engine) = guard.as_mut() {
        engine.set_access_token(access_token);
    }
    Ok(())
}

/// Rate-limit the `auth:expired` Tauri event to one emit per 30 s so a
/// poll/push cascade after an expiry doesn't spam the frontend with
/// refresh requests while the first one is still in flight.
static LAST_AUTH_EXPIRED_EMIT_MS: AtomicI64 = AtomicI64::new(0);
const AUTH_EXPIRED_THROTTLE_MS: i64 = 30_000;

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// If `err` looks like a server-side expired-token error, emit an
/// `auth:expired` Tauri event (throttled). The frontend is expected to
/// refresh via /device/refresh and call `update_engine_access_token`.
fn maybe_emit_auth_expired(app: &AppHandle, err: &dyn std::fmt::Display) {
    let msg = err.to_string();
    if !(msg.contains("410") && msg.contains("expired")) {
        return;
    }
    let now = now_unix_ms();
    let last = LAST_AUTH_EXPIRED_EMIT_MS.load(Ordering::Relaxed);
    if now - last < AUTH_EXPIRED_THROTTLE_MS {
        return;
    }
    LAST_AUTH_EXPIRED_EMIT_MS.store(now, Ordering::Relaxed);
    log::info!("Access token expired; emitting auth:expired for frontend refresh");
    app.emit("auth:expired", &()).ok();
}

// ── Discovery ───────────────────────────────────────────────────────────

/// Probe a user-entered server URL for the Selfbox discovery endpoint.
/// Called by the sign-in flow before opening a browser auth window —
/// confirms the URL points at a real Selfbox instance and reports
/// whether it's the Cloud or a self-hosted deployment. Runs over the
/// Rust `reqwest` client (not frontend `fetch`) so timeout, DNS, and
/// TLS errors surface as structured values instead of browser quirks.
#[tauri::command]
async fn probe_server_info(server_url: String) -> Result<api::types::ServerInfo, String> {
    let client = SelfboxClient::new(&server_url);
    client.server_info().await.map_err(|e| e.to_string())
}

// ── Device auth (Phase 1: HTTP via Rust to bypass WebView CORS) ──────────

#[tauri::command]
async fn device_start(server_url: String, platform: String) -> Result<DeviceTicket, String> {
    let client = SelfboxClient::new(&server_url);
    client
        .start_device_flow(&platform)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn device_exchange(
    server_url: String,
    device_code: String,
) -> Result<serde_json::Value, String> {
    let client = SelfboxClient::new(&server_url);
    client
        .exchange_device_code(&device_code)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn device_refresh(
    server_url: String,
    refresh_token: String,
) -> Result<serde_json::Value, String> {
    let client = SelfboxClient::new(&server_url);
    client
        .refresh_tokens(&refresh_token)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn device_revoke(
    server_url: String,
    access_token: String,
) -> Result<serde_json::Value, String> {
    let client = SelfboxClient::new(&server_url);
    client
        .revoke_device(&access_token)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_workspaces(
    server_url: String,
    access_token: String,
) -> Result<Vec<WorkspaceSummary>, String> {
    let mut client = SelfboxClient::new(&server_url);
    client.set_token(access_token);
    client.list_workspaces().await.map_err(|e| e.to_string())
}

// ── Sync metadata (Phase 2) ──────────────────────────────────────────────

#[tauri::command]
async fn sync_bootstrap(
    server_url: String,
    access_token: String,
    workspace_id: String,
) -> Result<BootstrapResult, String> {
    let mut client = SelfboxClient::new(&server_url);
    client.set_token(access_token);
    client
        .bootstrap(&workspace_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_changes(
    server_url: String,
    access_token: String,
    workspace_id: String,
    cursor: i64,
) -> Result<ChangesResult, String> {
    let mut client = SelfboxClient::new(&server_url);
    client.set_token(access_token);
    client
        .get_changes(&workspace_id, cursor)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_sync(
    app: AppHandle,
    workspace_id: String,
    local_root: String,
    device_name: String,
    device_id: String,
    server_url: String,
    access_token: String,
    state: State<'_, AppState>,
) -> Result<SyncStatusPayload, String> {
    log::info!("start_sync invoked (workspace_id={workspace_id})");
    std::fs::create_dir_all(&local_root).map_err(|e| e.to_string())?;

    let manifest_path = format!("{}/.selfbox-sync.db", &local_root);
    let manifest = SyncManifest::open(&manifest_path).map_err(|e| e.to_string())?;
    let needs_bootstrap = manifest.entry_count().map_err(|e| e.to_string())? == 0;

    let mut client = SelfboxClient::new(&server_url);
    client.set_token(access_token);

    let mut engine = SyncEngine::new(
        client,
        manifest,
        workspace_id,
        local_root.clone(),
        device_name,
        device_id,
    );

    if needs_bootstrap {
        app.emit(
            "sync:status",
            SyncStatusPayload {
                state: "syncing".into(),
                message: "Bootstrapping...".into(),
                cursor: 0,
            },
        )
        .ok();
        engine.bootstrap().await.map_err(|e| e.to_string())?;
    } else {
        // Returning user: catch up on any drift that happened while the app
        // was closed (renames/deletes/new files the live watcher can't see
        // retroactively), then let the background loop pull remote changes.
        app.emit(
            "sync:status",
            SyncStatusPayload {
                state: "syncing".into(),
                message: "Reconciling local changes...".into(),
                cursor: 0,
            },
        )
        .ok();

        // Replay any mutation that was in flight when the app last closed.
        // Runs before reconcile_from_disk so a half-applied rename doesn't
        // look like drift and get re-uploaded as a duplicate.
        match engine.replay_pending_ops().await {
            Ok(n) if n > 0 => log::info!("Replayed {n} pending ops on startup"),
            Ok(_) => {}
            Err(e) => log::warn!("Startup replay failed: {e}"),
        }

        if let Err(e) = engine.reconcile_from_disk().await {
            log::warn!("Startup reconciliation failed: {e}");
        }
        for notice in engine.drain_conflicts() {
            app.emit("sync:conflict", &notice).ok();
        }
        for item in engine.drain_activity() {
            app.emit("sync:activity", &item).ok();
        }
    }

    let cursor = engine.manifest_cursor().map_err(|e| e.to_string())?;

    let watcher =
        FsWatcher::new(std::path::Path::new(&local_root)).map_err(|e| e.to_string())?;

    // Stash the engine and watcher in async mutexes so the background
    // loop and commands can share them without fighting std::sync::Mutex.
    *state.engine.lock().await = Some(engine);
    *state.watcher.lock().await = Some(watcher);
    *state.local_root.lock().unwrap() = Some(local_root);
    *state.server_url.lock().unwrap() = Some(server_url);

    // Shut down any prior background loop, then start a fresh one. If
    // start_sync is being called repeatedly in quick succession (e.g. a
    // React effect remounting), each call tears down the prior loop
    // before its 10s poll tick had a chance to fire — meaning server →
    // local change-feed events never get applied. Look for repeated
    // `start_sync invoked` log lines to spot that pattern.
    shutdown_loop(&state);
    spawn_sync_loop(
        app.clone(),
        state.engine.clone(),
        state.watcher.clone(),
        make_shutdown(&state),
    );

    let payload = SyncStatusPayload {
        state: "idle".into(),
        message: "Up to date".into(),
        cursor,
    };
    app.emit("sync:status", payload.clone()).ok();

    Ok(payload)
}

#[tauri::command]
async fn poll_sync(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SyncStatusPayload, String> {
    let mut guard = state.engine.lock().await;
    let engine = guard.as_mut().ok_or("Sync engine not initialized")?;

    let has_more = engine.poll_changes().await.map_err(|e| e.to_string())?;
    let cursor = engine.manifest_cursor().map_err(|e| e.to_string())?;

    let payload = SyncStatusPayload {
        state: if has_more { "syncing" } else { "idle" }.into(),
        message: if has_more {
            "Applying changes...".into()
        } else {
            "Up to date".into()
        },
        cursor,
    };
    app.emit("sync:status", payload.clone()).ok();

    Ok(payload)
}

/// Drain any pending filesystem events and push them to the server.
#[tauri::command]
async fn process_local_changes(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let changes = {
        let watcher_guard = state.watcher.lock().await;
        match watcher_guard.as_ref() {
            Some(w) => w.drain_events(),
            None => return Ok(0),
        }
    };

    if changes.is_empty() {
        return Ok(0);
    }

    let mut guard = state.engine.lock().await;
    let engine = guard.as_mut().ok_or("Sync engine not initialized")?;

    let uploaded = engine
        .push_local_changes(&changes)
        .await
        .map_err(|e| e.to_string())?;

    if uploaded > 0 {
        app.emit(
            "sync:status",
            SyncStatusPayload {
                state: "idle".into(),
                message: format!(
                    "Uploaded {} change{}",
                    uploaded,
                    if uploaded == 1 { "" } else { "s" }
                ),
                cursor: engine.manifest_cursor().unwrap_or(0),
            },
        )
        .ok();
    }

    Ok(uploaded)
}

#[tauri::command]
async fn pause_sync(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(engine) = state.engine.lock().await.as_mut() {
        engine.pause();
    }
    app.emit(
        "sync:status",
        SyncStatusPayload {
            state: "paused".into(),
            message: "Paused".into(),
            cursor: 0,
        },
    )
    .ok();
    Ok(())
}

#[tauri::command]
async fn resume_sync(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    if let Some(engine) = state.engine.lock().await.as_mut() {
        engine.resume();
    }
    app.emit(
        "sync:status",
        SyncStatusPayload {
            state: "syncing".into(),
            message: "Resuming".into(),
            cursor: 0,
        },
    )
    .ok();
    Ok(())
}

/// Return the current list of excluded folder remote-ids for the active
/// workspace. Empty if no engine is running or nothing is excluded.
#[tauri::command]
async fn get_excluded_folders(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let guard = state.engine.lock().await;
    match guard.as_ref() {
        Some(engine) => engine.list_excluded_folders().map_err(|e| e.to_string()),
        None => Ok(Vec::new()),
    }
}

/// Replace the exclusion set. Any newly-excluded folder has its local
/// subtree deleted from disk plus its manifest entries removed so stale
/// entries don't confuse reconciliation. Newly-included folders are only
/// un-marked here; content for them is fetched on the next sync cycle.
#[tauri::command]
async fn set_excluded_folders(
    state: State<'_, AppState>,
    excluded_folder_ids: Vec<String>,
) -> Result<(), String> {
    let mut guard = state.engine.lock().await;
    let engine = guard.as_mut().ok_or("Sync engine not initialized")?;
    engine
        .set_excluded_folders(&excluded_folder_ids)
        .await
        .map_err(|e| e.to_string())
}

/// Tear down the active sync session cleanly: stop the background loop,
/// drop the engine + watcher (which closes the manifest SQLite and the FS
/// watch handle), and clear in-memory workspace/root state. Leaves tokens
/// and device identity untouched so the caller can start sync again for a
/// different workspace or after a folder move.
#[tauri::command]
async fn stop_sync(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    shutdown_loop(&state);

    // Drop the engine first — holds the manifest connection and all the
    // per-workspace state. Watcher next, which releases the FS watch.
    *state.engine.lock().await = None;
    *state.watcher.lock().await = None;
    *state.local_root.lock().unwrap() = None;

    app.emit(
        "sync:status",
        SyncStatusPayload {
            state: "stopped".into(),
            message: "Not synced".into(),
            cursor: 0,
        },
    )
    .ok();
    Ok(())
}

/// Move the sync folder to a new location on the same filesystem. Requires
/// sync to be stopped (call `stop_sync` first). Moves the entire folder
/// including the `.selfbox-sync.db` manifest, then rewrites every manifest
/// entry's `local_path` to point at the new root.
///
/// Cross-filesystem moves are rejected with a clear error — copying gigabytes
/// between volumes is a different UX (would need a progress bar) and is out
/// of scope for now.
#[tauri::command]
async fn move_local_root(
    state: State<'_, AppState>,
    old_root: String,
    new_root: String,
) -> Result<(), String> {
    // Safety: engine must not be holding the manifest open.
    if state.engine.lock().await.is_some() {
        return Err("Stop sync before moving the sync folder".into());
    }

    let old_path = std::path::PathBuf::from(&old_root);
    let new_path = std::path::PathBuf::from(&new_root);

    if !old_path.exists() {
        return Err(format!("Source folder does not exist: {old_root}"));
    }
    if new_path.exists() {
        // Accept only if it's the same path (no-op) or empty.
        let same = std::fs::canonicalize(&old_path).ok()
            == std::fs::canonicalize(&new_path).ok();
        if same {
            return Ok(());
        }
        let is_empty = std::fs::read_dir(&new_path)
            .map_err(|e| format!("Cannot read destination: {e}"))?
            .next()
            .is_none();
        if !is_empty {
            return Err("Destination folder is not empty".into());
        }
        // Remove the empty placeholder so rename can succeed atomically.
        std::fs::remove_dir(&new_path)
            .map_err(|e| format!("Cannot prepare destination: {e}"))?;
    }

    if let Some(parent) = new_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create parent of destination: {e}"))?;
    }

    // std::fs::rename is atomic on the same filesystem; errors cross-volume.
    std::fs::rename(&old_path, &new_path).map_err(|e| {
        format!(
            "Could not move {old_root} to {new_root}: {e}. \
             Cross-filesystem moves are not supported yet — pick a location \
             on the same volume."
        )
    })?;

    // Rewrite manifest paths to point at the new root. The manifest file
    // has moved along with the folder; open it at the new location.
    let manifest_path = new_path.join(".selfbox-sync.db");
    if manifest_path.exists() {
        let manifest = sync::manifest::SyncManifest::open(
            manifest_path.to_str().ok_or("Non-UTF-8 manifest path")?,
        )
        .map_err(|e| format!("Cannot open manifest: {e}"))?;
        manifest
            .rewrite_local_path_prefix(&old_root, &new_root)
            .map_err(|e| format!("Cannot rewrite manifest paths: {e}"))?;
    }

    *state.local_root.lock().unwrap() = Some(new_root);
    Ok(())
}

#[tauri::command]
fn open_sync_folder(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let root = state.local_root.lock().unwrap().clone();
    if let Some(path) = root {
        app.opener().open_path(&path, None::<&str>).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}

/// Hide the main window rather than exiting — user can reopen via the tray.
#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Fully quit the app. Called from the tray menu's Quit item.
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_web(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    let url = state.server_url.lock().unwrap().clone();
    if let Some(u) = url {
        app.opener().open_url(&u, None::<&str>).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Background sync loop ──────────────────────────────────────────────────

/// Interval for pushing local filesystem changes to the server.
const PUSH_INTERVAL_SECS: u64 = 5;
/// Interval for polling the server for remote changes.
const POLL_INTERVAL_SECS: u64 = 10;

/// Spawn the background sync loop. Runs until `shutdown` is flipped to `true`.
/// Drives both directions of sync — local → server (push) and server → local
/// (poll) — on independent interval timers.
fn spawn_sync_loop(
    app: AppHandle,
    engine: Arc<AsyncMutex<Option<SyncEngine>>>,
    watcher: Arc<AsyncMutex<Option<FsWatcher>>>,
    mut shutdown: watch::Receiver<bool>,
) {
    tauri::async_runtime::spawn(async move {
        let mut push_tick = tokio::time::interval(Duration::from_secs(PUSH_INTERVAL_SECS));
        let mut poll_tick = tokio::time::interval(Duration::from_secs(POLL_INTERVAL_SECS));
        // interval's first tick fires immediately; skip it so we don't double
        // up with the work start_sync already did.
        push_tick.tick().await;
        poll_tick.tick().await;

        log::info!("Background sync loop started");

        loop {
            tokio::select! {
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        log::info!("Background sync loop shutting down");
                        return;
                    }
                }
                _ = push_tick.tick() => {
                    run_push(&app, &engine, &watcher).await;
                }
                _ = poll_tick.tick() => {
                    run_poll(&app, &engine).await;
                }
            }
        }
    });
}

async fn run_push(
    app: &AppHandle,
    engine: &Arc<AsyncMutex<Option<SyncEngine>>>,
    watcher: &Arc<AsyncMutex<Option<FsWatcher>>>,
) {
    let changes = {
        let guard = watcher.lock().await;
        match guard.as_ref() {
            Some(w) => w.drain_events(),
            None => return,
        }
    };
    if changes.is_empty() {
        return;
    }

    let mut guard = engine.lock().await;
    let Some(engine) = guard.as_mut() else {
        return;
    };
    if engine.is_paused() {
        return;
    }

    let result = engine.push_local_changes(&changes).await;
    for notice in engine.drain_conflicts() {
        app.emit("sync:conflict", &notice).ok();
    }
    for item in engine.drain_activity() {
        app.emit("sync:activity", &item).ok();
    }
    match result {
        Ok(n) if n > 0 => {
            app.emit(
                "sync:status",
                SyncStatusPayload {
                    state: "idle".into(),
                    message: format!("Uploaded {n} change{}", if n == 1 { "" } else { "s" }),
                    cursor: engine.manifest_cursor().unwrap_or(0),
                },
            )
            .ok();
        }
        Ok(_) => {}
        Err(e) => {
            maybe_emit_auth_expired(app, &e);
            log::warn!("Background push failed: {e}");
        }
    }
}

async fn run_poll(app: &AppHandle, engine: &Arc<AsyncMutex<Option<SyncEngine>>>) {
    let mut guard = engine.lock().await;
    let Some(engine) = guard.as_mut() else {
        return;
    };
    if engine.is_paused() {
        return;
    }

    let result = engine.poll_changes().await;
    for notice in engine.drain_conflicts() {
        app.emit("sync:conflict", &notice).ok();
    }
    for item in engine.drain_activity() {
        app.emit("sync:activity", &item).ok();
    }
    match result {
        Ok(has_more) => {
            let cursor = engine.manifest_cursor().unwrap_or(0);
            app.emit(
                "sync:status",
                SyncStatusPayload {
                    state: if has_more { "syncing" } else { "idle" }.into(),
                    message: if has_more {
                        "Applying changes...".into()
                    } else {
                        "Up to date".into()
                    },
                    cursor,
                },
            )
            .ok();
        }
        Err(e) => {
            maybe_emit_auth_expired(app, &e);
            log::warn!("Background poll failed: {e}");
        }
    }
}

/// Create a fresh shutdown channel, stash the sender in AppState, and
/// return the receiver for the new loop task.
fn make_shutdown(state: &AppState) -> watch::Receiver<bool> {
    let (tx, rx) = watch::channel(false);
    *state.loop_shutdown.lock().unwrap() = Some(tx);
    rx
}

/// Signal any running background loop to stop. No-op if nothing is running.
fn shutdown_loop(state: &AppState) {
    if let Some(tx) = state.loop_shutdown.lock().unwrap().take() {
        let _ = tx.send(true);
    }
}

// ── App entry ─────────────────────────────────────────────────────────────

pub fn run() {
    // Default to info-level logging in dev so sync warnings/errors are visible.
    // Users can still override via RUST_LOG env var.
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Auto-update support. The plugin uses the `endpoints` + `pubkey`
        // from tauri.conf.json's `plugins.updater` section. The frontend
        // calls into it via @tauri-apps/plugin-updater. The process plugin
        // gives us `relaunch()` so the app restarts after applying an
        // update.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // `MacosLauncher` is only consumed on macOS; on Windows the plugin
        // uses the HKCU Run registry key, and on Linux it drops a
        // `.desktop` file under ~/.config/autostart/. All three support
        // the `--autostart` argument the same way.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .manage(AppState {
            client: StdMutex::new(None),
            engine: Arc::new(AsyncMutex::new(None)),
            watcher: Arc::new(AsyncMutex::new(None)),
            local_root: StdMutex::new(None),
            server_url: StdMutex::new(None),
            loop_shutdown: StdMutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_default_sync_root,
            pick_folder,
            save_tokens_to_keychain,
            load_tokens_from_keychain,
            clear_tokens_from_keychain,
            configure_client,
            update_engine_access_token,
            probe_server_info,
            device_start,
            device_exchange,
            device_refresh,
            device_revoke,
            list_workspaces,
            sync_bootstrap,
            sync_changes,
            start_sync,
            stop_sync,
            move_local_root,
            get_excluded_folders,
            set_excluded_folders,
            poll_sync,
            process_local_changes,
            pause_sync,
            resume_sync,
            open_sync_folder,
            open_web,
            is_autostart_enabled,
            set_autostart,
            hide_main_window,
            quit_app,
        ])
        .on_window_event(|window, event| {
            // Tray-app convention: closing the window shouldn't kill the app.
            // Hide it instead — the tray icon stays as the reopen affordance.
            // Quit is reachable via the tray menu's Quit item, which calls
            // app.exit() explicitly.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let _tray = tray::setup_tray(app.handle())?;

            // If launched with --autostart (set up as the argument to the
            // auto-launch agent), start minimized: don't pop the window.
            let was_autostarted = std::env::args().any(|a| a == "--autostart");
            if was_autostarted {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            log::info!("Selfbox Desktop Sync started");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Selfbox Desktop Sync");
}
