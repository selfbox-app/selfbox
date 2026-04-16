import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ── Platform / paths ───────────────────────────────────────────────────

export function getPlatform(): Promise<string> {
  return invoke("get_platform");
}

export function getDefaultSyncRoot(): Promise<string> {
  return invoke("get_default_sync_root");
}

export function pickFolder(): Promise<string | null> {
  return invoke("pick_folder");
}

// ── Keychain ────────────────────────────────────────────────────────────

export function saveTokensToKeychain(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  return invoke("save_tokens_to_keychain", { accessToken, refreshToken });
}

export function loadTokensFromKeychain(): Promise<[string, string] | null> {
  return invoke("load_tokens_from_keychain");
}

export function clearTokensFromKeychain(): Promise<void> {
  return invoke("clear_tokens_from_keychain");
}

// ── Client configuration ──────────────────────────────────────────────

export function configureClient(
  serverUrl: string,
  accessToken: string,
): Promise<void> {
  return invoke("configure_client", { serverUrl, accessToken });
}

// ── Sync lifecycle ──────────────────────────────────────────────────────

export interface SyncStatusPayload {
  state: "idle" | "syncing" | "paused" | "error";
  message: string;
  cursor: number;
}

export interface ActivityEvent {
  kind: "upload" | "download" | "rename" | "move" | "delete" | "conflict";
  entityType: "file" | "folder";
  entityId: string;
  name: string;
  at: string;
}

export function startSync(opts: {
  workspaceId: string;
  localRoot: string;
  deviceName: string;
  /** Server-issued device id; used for change-feed echo suppression. */
  deviceId: string;
  serverUrl: string;
  accessToken: string;
}): Promise<SyncStatusPayload> {
  return invoke("start_sync", opts);
}

export function pollSync(): Promise<SyncStatusPayload> {
  return invoke("poll_sync");
}

/** Tear down the active sync session (loop, engine, watcher). Tokens untouched. */
export function stopSync(): Promise<void> {
  return invoke("stop_sync");
}

/** Move the sync folder to a new location on the same filesystem. Requires stop_sync first. */
export function moveLocalRoot(oldRoot: string, newRoot: string): Promise<void> {
  return invoke("move_local_root", { oldRoot, newRoot });
}

// ── Selective sync ─────────────────────────────────────────────────────

/** Remote folder ids currently excluded from local mirroring. */
export function getExcludedFolders(): Promise<string[]> {
  return invoke("get_excluded_folders");
}

/** Replace the exclusion set. Newly-excluded folders are deleted on disk. */
export function setExcludedFolders(excludedFolderIds: string[]): Promise<void> {
  return invoke("set_excluded_folders", { excludedFolderIds });
}

/** Drain local filesystem events and push them to the server. Returns count uploaded. */
export function processLocalChanges(): Promise<number> {
  return invoke("process_local_changes");
}

export function pauseSync(): Promise<void> {
  return invoke("pause_sync");
}

export function resumeSync(): Promise<void> {
  return invoke("resume_sync");
}

/** Swap in a freshly-refreshed access token on the running sync engine. */
export function updateEngineAccessToken(accessToken: string): Promise<void> {
  return invoke("update_engine_access_token", { accessToken });
}

export function openSyncFolder(): Promise<void> {
  return invoke("open_sync_folder");
}

export function openWeb(): Promise<void> {
  return invoke("open_web");
}

// ── Autostart ───────────────────────────────────────────────────────────

export function isAutostartEnabled(): Promise<boolean> {
  return invoke("is_autostart_enabled");
}

export function setAutostart(enabled: boolean): Promise<void> {
  return invoke("set_autostart", { enabled });
}

// ── Window lifecycle ────────────────────────────────────────────────────

export function hideMainWindow(): Promise<void> {
  return invoke("hide_main_window");
}

export function quitApp(): Promise<void> {
  return invoke("quit_app");
}

export function startWindowDrag(): Promise<void> {
  return getCurrentWindow().startDragging();
}

// ── Event listeners ─────────────────────────────────────────────────────

/** Called by Rust whenever the sync status changes */
export function onSyncStatus(
  handler: (payload: SyncStatusPayload) => void,
): Promise<UnlistenFn> {
  return listen<SyncStatusPayload>("sync:status", (e) => handler(e.payload));
}

/** Called by Rust when a sync event is applied locally */
export function onActivity(
  handler: (payload: ActivityEvent) => void,
): Promise<UnlistenFn> {
  return listen<ActivityEvent>("sync:activity", (e) => handler(e.payload));
}

/** Called by Rust when the access token has expired and needs refreshing. */
export function onAuthExpired(handler: () => void): Promise<UnlistenFn> {
  return listen<null>("auth:expired", () => handler());
}

/** Called when tray menu requests navigation */
export function onTrayNavigate(
  handler: (screen: string) => void,
): Promise<UnlistenFn> {
  return listen<string>("tray:navigate", (e) => handler(e.payload));
}

/** Called when tray menu clicks pause */
export function onTrayTogglePause(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("tray:toggle_pause", () => handler());
}

/** Called when tray menu clicks "Open Sync Folder" */
export function onTrayOpenFolder(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("tray:open_folder", () => handler());
}

/** Called when tray menu clicks "Open Selfbox on Web" */
export function onTrayOpenWeb(
  handler: () => void,
): Promise<UnlistenFn> {
  return listen("tray:open_web", () => handler());
}

/** True if running inside Tauri (as opposed to vite dev in a plain browser) */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
