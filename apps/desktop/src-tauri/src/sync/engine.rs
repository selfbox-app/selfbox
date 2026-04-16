use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::api::client::SelfboxClient;
use crate::api::types::{FileSnapshot, FolderSnapshot};
use super::manifest::{ManifestEntry, SyncManifest};
use super::conflicts::write_conflict_copy;

/// Notification that a file conflict was auto-resolved. The engine accumulates
/// these during push/poll; lib.rs drains the queue and forwards to the UI via
/// a Tauri `sync://conflict` event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictNotice {
    /// "local" — our upload lost to a newer remote; local bytes preserved.
    /// "remote" — an incoming change would overwrite our newer local bytes; local preserved.
    pub side: &'static str,
    pub file_name: String,
    pub conflict_path: String,
}

/// One entry in the Status page's "Recent activity" list. The engine
/// accumulates these as it applies operations; lib.rs drains the queue
/// and forwards each to the UI via a Tauri `sync:activity` event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    /// "upload" | "download" | "rename" | "move" | "delete"
    pub kind: &'static str,
    /// "file" | "folder"
    pub entity_type: &'static str,
    pub entity_id: String,
    pub name: String,
    pub at: String, // RFC-3339 UTC
}

/// Core sync engine — orchestrates bootstrap, incremental sync, and local changes.
pub struct SyncEngine {
    client: SelfboxClient,
    manifest: SyncManifest,
    workspace_id: String,
    local_root: String,
    device_name: String,
    /// Server-issued id for this device. Used to filter out change-feed
    /// events caused by this client itself (echo suppression).
    device_id: String,
    paused: bool,
    conflicts: Vec<ConflictNotice>,
    activity: Vec<ActivityItem>,
}

impl SyncEngine {
    pub fn new(
        client: SelfboxClient,
        manifest: SyncManifest,
        workspace_id: String,
        local_root: String,
        device_name: String,
        device_id: String,
    ) -> Self {
        Self {
            client,
            manifest,
            workspace_id,
            local_root,
            device_name,
            device_id,
            paused: false,
            conflicts: Vec::new(),
            activity: Vec::new(),
        }
    }

    /// Take the conflicts accumulated since the last drain. Caller is
    /// responsible for surfacing them to the UI.
    pub fn drain_conflicts(&mut self) -> Vec<ConflictNotice> {
        std::mem::take(&mut self.conflicts)
    }

    /// Take the activity items accumulated since the last drain. Caller
    /// emits each one as a `sync:activity` Tauri event for the UI.
    pub fn drain_activity(&mut self) -> Vec<ActivityItem> {
        std::mem::take(&mut self.activity)
    }

    fn push_activity(
        &mut self,
        kind: &'static str,
        entity_type: &'static str,
        entity_id: impl Into<String>,
        name: impl Into<String>,
    ) {
        self.activity.push(ActivityItem {
            kind,
            entity_type,
            entity_id: entity_id.into(),
            name: name.into(),
            at: chrono::Utc::now().to_rfc3339(),
        });
    }

    /// Run the initial bootstrap: fetch full remote tree, create local directories and files.
    pub async fn bootstrap(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        log::info!("Starting bootstrap for workspace {}", self.workspace_id);
        let result = self.client.bootstrap(&self.workspace_id).await?;

        // Build parent→path lookup
        let folder_paths = self.build_folder_paths(&result.folders);

        // Build the transitive set of excluded folder ids: any explicitly
        // excluded folder plus every folder whose ancestor chain crosses one.
        // Without the closure, a file in a sub-sub-folder of an excluded
        // folder would get downloaded because its direct folder_id isn't
        // the excluded one.
        let explicit_excluded: std::collections::HashSet<String> = self
            .manifest
            .list_excluded_folder_ids()?
            .into_iter()
            .collect();
        let excluded_ids = compute_excluded_closure(&result.folders, &explicit_excluded);

        // Create folder structure (skip excluded subtrees)
        for folder in &result.folders {
            if excluded_ids.contains(&folder.id) {
                continue;
            }
            let local_path = folder_paths.get(&folder.id).cloned().unwrap_or_else(|| {
                PathBuf::from(&self.local_root)
                    .join(super::winfs::sanitize_for_local_fs(&folder.name))
            });

            std::fs::create_dir_all(&local_path)?;

            self.manifest.upsert_entry(&ManifestEntry {
                remote_id: folder.id.clone(),
                entity_type: "folder".into(),
                remote_path: folder.name.clone(),
                local_path: local_path.to_string_lossy().to_string(),
                remote_version: folder.version,
                checksum: None,
                size: 0,
                synced_at: chrono::Utc::now().to_rfc3339(),
            })?;
        }

        // Download files (skip files whose parent folder is excluded AND
        // files we already have with the correct checksum on disk). The
        // skip matters on repeated bootstraps — selective-sync re-include
        // re-bootstraps to pull newly-included folders, and without the
        // skip every other synced file gets redownloaded unnecessarily.
        for file in &result.files {
            if file.status != "ready" {
                continue;
            }
            if let Some(fid) = &file.folder_id {
                if excluded_ids.contains(fid) {
                    continue;
                }
            }

            let parent_path = file
                .folder_id
                .as_ref()
                .and_then(|fid| folder_paths.get(fid))
                .cloned()
                .unwrap_or_else(|| PathBuf::from(&self.local_root));

            if let Some(existing) = self.manifest.get_entry(&file.id)? {
                let local_path = Path::new(&existing.local_path);
                if local_path.exists()
                    && existing.checksum == file.checksum
                    && existing.remote_version == file.version
                {
                    continue;
                }
            }

            self.download_file(file, &parent_path).await?;
        }

        self.manifest.set_cursor(result.cursor)?;
        log::info!("Bootstrap complete, cursor = {}", result.cursor);
        Ok(())
    }

    /// Poll for incremental changes since last cursor.
    pub async fn poll_changes(&mut self) -> Result<bool, Box<dyn std::error::Error>> {
        if self.paused {
            return Ok(false);
        }

        let cursor = self.manifest.get_cursor()?;
        let changes = self.client.get_changes(&self.workspace_id, cursor).await?;

        if changes.cursor_invalid {
            log::warn!("Cursor {} is stale, re-bootstrapping...", cursor);
            self.bootstrap().await?;
            return Ok(true);
        }

        if changes.events.is_empty() {
            return Ok(false);
        }

        // Echo suppression: drop any event we caused. The server tags every
        // mutation with the actor's device id; if it's ours, we already
        // applied the change locally, and re-applying it would (a) overwrite
        // a possibly-newer local edit and (b) surface a misleading "download"
        // entry in the activity panel for what the user just uploaded.
        let own_events: Vec<&crate::api::types::SyncEvent> = changes
            .events
            .iter()
            .filter(|e| e.actor_device_id.as_deref() == Some(&self.device_id))
            .collect();
        let foreign_events: Vec<&crate::api::types::SyncEvent> = changes
            .events
            .iter()
            .filter(|e| e.actor_device_id.as_deref() != Some(&self.device_id))
            .collect();

        if foreign_events.is_empty() {
            // Still need to advance the cursor so we don't re-poll our own
            // events on the next tick.
            self.manifest.set_cursor(changes.cursor)?;
            log::debug!(
                "Polling: skipped {} self-originated event(s); no foreign events",
                own_events.len()
            );
            return Ok(changes.has_more);
        }

        log::info!(
            "Polling: applying {} change-feed event(s) from cursor {} ({} self-originated, skipped)",
            foreign_events.len(),
            cursor,
            own_events.len()
        );

        for event in foreign_events {
            log::debug!(
                "apply event cursor={} type={} entity={} id={}",
                event.cursor,
                event.event_type,
                event.entity_type,
                event.entity_id
            );
            let result = match event.event_type.as_str() {
                "created" => self.apply_created(event).await,
                "updated" => self.apply_updated(event).await,
                "renamed" => self.apply_renamed(event).await,
                "moved" => self.apply_moved(event).await,
                "deleted" => self.apply_deleted(event),
                other => {
                    log::warn!("Unknown event type: {}", other);
                    Ok(())
                }
            };

            if let Err(e) = result {
                log::error!(
                    "Failed to apply {} event for {}: {}",
                    event.event_type, event.entity_id, e
                );
            }
        }

        self.manifest.set_cursor(changes.cursor)?;
        Ok(changes.has_more)
    }

    pub fn pause(&mut self) {
        self.paused = true;
        log::info!("Sync paused");
    }

    pub fn resume(&mut self) {
        self.paused = false;
        log::info!("Sync resumed");
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn manifest_cursor(&self) -> Result<i64, Box<dyn std::error::Error>> {
        Ok(self.manifest.get_cursor()?)
    }

    /// Swap in a freshly-refreshed bearer token without tearing down the
    /// engine. Called after the frontend completes a token refresh in
    /// response to an `auth:expired` signal.
    pub fn set_access_token(&mut self, token: String) {
        self.client.set_token(token);
    }

    // ── Event handlers ────────────────────────────────────────────────

    async fn apply_created(
        &mut self,
        event: &crate::api::types::SyncEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        match event.entity_type.as_str() {
            "folder" => {
                let parent_id = event.payload["parentId"].as_str();

                // If parent is excluded, this folder is too — extend the
                // exclusion set so any files or sub-folders that land
                // beneath it are filtered out. We record a synthetic
                // local_path (parent's + name) so local-side checks still
                // work even though nothing lands on disk.
                if let Some(pid) = parent_id {
                    if self.manifest.is_folder_excluded(pid)? {
                        let name = event.payload["name"].as_str().unwrap_or("unnamed");
                        let parent_entry = self.manifest.get_entry(pid)?;
                        let hypothetical = parent_entry
                            .map(|e| PathBuf::from(e.local_path).join(name))
                            .unwrap_or_else(|| PathBuf::from(&self.local_root).join(name));
                        self.manifest.exclude_folder(
                            &event.entity_id,
                            &hypothetical.to_string_lossy(),
                        )?;
                        log::debug!(
                            "Skipping folder {} ({}): parent is excluded",
                            event.entity_id,
                            name
                        );
                        return Ok(());
                    }
                }

                let name = event.payload["name"].as_str().unwrap_or("unnamed");
                let local_name = super::winfs::sanitize_for_local_fs(name);
                let parent_path = self.resolve_parent_path(parent_id);
                let local_path = parent_path.join(&local_name);

                log::info!(
                    "Creating local folder: name={name:?} parent_id={parent_id:?} \
                     parent_path={parent_path:?} local_path={local_path:?}"
                );

                std::fs::create_dir_all(&local_path)?;

                let version = event.payload["version"].as_i64().unwrap_or(1);
                self.manifest.upsert_entry(&ManifestEntry {
                    remote_id: event.entity_id.clone(),
                    entity_type: "folder".into(),
                    remote_path: name.into(),
                    local_path: local_path.to_string_lossy().to_string(),
                    remote_version: version,
                    checksum: None,
                    size: 0,
                    synced_at: chrono::Utc::now().to_rfc3339(),
                })?;
                self.push_activity("download", "folder", event.entity_id.clone(), name);
            }
            "file" => {
                let file: FileSnapshot = serde_json::from_value(event.payload.clone())?;
                // Skip if the file's folder is excluded.
                if let Some(fid) = &file.folder_id {
                    if self.manifest.is_folder_excluded(fid)? {
                        log::debug!(
                            "Skipping file {} ({}): folder is excluded",
                            event.entity_id,
                            file.name
                        );
                        return Ok(());
                    }
                }
                let parent_path = self.resolve_parent_path(file.folder_id.as_deref());
                self.download_file(&file, &parent_path).await?;
                self.push_activity("download", "file", event.entity_id.clone(), &file.name);
            }
            _ => {}
        }
        Ok(())
    }

    async fn apply_updated(
        &mut self,
        event: &crate::api::types::SyncEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if event.entity_type != "file" {
            return Ok(());
        }

        let file: FileSnapshot = serde_json::from_value(event.payload.clone())?;
        let entry = self.manifest.get_entry(&event.entity_id)?;

        if let Some(existing) = &entry {
            // Check for conflict: local file was modified since last sync
            let local_path = Path::new(&existing.local_path);
            if local_path.exists() {
                let local_checksum = self.compute_file_checksum(local_path)?;
                if existing.checksum.as_deref() != Some(&local_checksum) {
                    // Local was modified too — move local to a sibling
                    // conflict file before we overwrite the path with the
                    // authoritative remote copy below.
                    let conflict_path =
                        write_conflict_copy(local_path, &self.device_name)?;
                    log::warn!("Conflict: saved local as {:?}", conflict_path);
                    self.conflicts.push(ConflictNotice {
                        side: "remote",
                        file_name: file.name.clone(),
                        conflict_path: conflict_path.to_string_lossy().into(),
                    });
                }
            }
        }

        let parent_path = self.resolve_parent_path(file.folder_id.as_deref());
        self.download_file(&file, &parent_path).await?;
        self.push_activity("download", "file", event.entity_id.clone(), &file.name);
        Ok(())
    }

    async fn apply_renamed(
        &mut self,
        event: &crate::api::types::SyncEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let new_name = event.payload["name"].as_str().unwrap_or("unnamed");
        let version = event.payload["version"].as_i64().unwrap_or(1);

        if let Some(entry) = self.manifest.get_entry(&event.entity_id)? {
            let old_path = PathBuf::from(&entry.local_path);
            let new_path = old_path.parent().unwrap().join(new_name);

            if old_path.exists() && old_path != new_path {
                std::fs::rename(&old_path, &new_path)?;
            }

            let entity_type: &'static str = if entry.entity_type == "folder" {
                "folder"
            } else {
                "file"
            };
            self.manifest.upsert_entry(&ManifestEntry {
                local_path: new_path.to_string_lossy().to_string(),
                remote_path: new_name.into(),
                remote_version: version,
                synced_at: chrono::Utc::now().to_rfc3339(),
                ..entry
            })?;
            self.push_activity("rename", entity_type, event.entity_id.clone(), new_name);
        }
        Ok(())
    }

    async fn apply_moved(
        &mut self,
        event: &crate::api::types::SyncEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let version = event.payload["version"].as_i64().unwrap_or(1);
        let new_parent_id = if event.entity_type == "folder" {
            event.payload["parentId"].as_str()
        } else {
            event.payload["folderId"].as_str()
        };

        if let Some(entry) = self.manifest.get_entry(&event.entity_id)? {
            let old_path = PathBuf::from(&entry.local_path);
            let new_parent = self.resolve_parent_path(new_parent_id);
            let file_name = old_path.file_name().unwrap_or_default();
            let new_path = new_parent.join(file_name);

            if old_path.exists() && old_path != new_path {
                std::fs::create_dir_all(&new_parent)?;
                std::fs::rename(&old_path, &new_path)?;
            }

            let entity_type: &'static str = if entry.entity_type == "folder" {
                "folder"
            } else {
                "file"
            };
            let display_name = entry.remote_path.clone();
            self.manifest.upsert_entry(&ManifestEntry {
                local_path: new_path.to_string_lossy().to_string(),
                remote_version: version,
                synced_at: chrono::Utc::now().to_rfc3339(),
                ..entry
            })?;
            self.push_activity("move", entity_type, event.entity_id.clone(), display_name);
        }
        Ok(())
    }

    fn apply_deleted(
        &mut self,
        event: &crate::api::types::SyncEvent,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(entry) = self.manifest.get_entry(&event.entity_id)? {
            let path = Path::new(&entry.local_path);
            if path.exists() {
                if path.is_dir() {
                    std::fs::remove_dir_all(path)?;
                } else {
                    std::fs::remove_file(path)?;
                }
            }
            let entity_type: &'static str = if entry.entity_type == "folder" {
                "folder"
            } else {
                "file"
            };
            let display_name = entry.remote_path.clone();
            self.manifest.remove_entry(&event.entity_id)?;
            self.push_activity("delete", entity_type, event.entity_id.clone(), display_name);
        }
        Ok(())
    }

    /// After an upload attempt was rejected with a version conflict, fetch
    /// the authoritative remote snapshot and write it to the original local
    /// path. Returns the server file's name so the caller can log it in the
    /// conflict notice.
    ///
    /// The local bytes have already been moved to a sibling conflict file by
    /// the uploader; the next watcher tick will upload that sibling as a
    /// fresh file.
    async fn resolve_upload_conflict(
        &mut self,
        remote_id: &str,
        current_version: i64,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let file = self
            .client
            .get_file(&self.workspace_id, remote_id)
            .await?;

        // Sanity-check that the server's version matches what it told us on
        // the 409 — if a third write happened in between, still trust the
        // snapshot we just fetched.
        if file.version != current_version {
            log::info!(
                "Remote advanced from {} to {} during conflict recovery for {}",
                current_version,
                file.version,
                remote_id
            );
        }

        let parent_path = self.resolve_parent_path(file.folder_id.as_deref());
        let file_name = file.name.clone();
        self.download_file(&file, &parent_path).await?;
        Ok(file_name)
    }

    // ── File download ─────────────────────────────────────────────────

    async fn download_file(
        &mut self,
        file: &FileSnapshot,
        parent_path: &Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let url_res = self
            .client
            .get_download_url(&self.workspace_id, &file.id)
            .await?;
        let url = url_res["url"]
            .as_str()
            .ok_or("Missing download URL")?;

        // Download to temp file. Sanitize the name for the local FS —
        // servers can legitimately store names that are invalid on
        // Windows (e.g. `8:30 meeting.md`) so we translate them at the
        // write boundary. Manifest keeps the server name separately in
        // `remote_path` so round-tripping still works.
        let local_name = super::winfs::sanitize_for_local_fs(&file.name);
        let local_path = parent_path.join(&local_name);
        let tmp_path = local_path.with_extension("selfbox-tmp");

        let bytes = self.client.download_bytes(url).await?;

        // Verify checksum if provided
        if let Some(expected) = &file.checksum {
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let actual = format!("{:x}", hasher.finalize());
            if &actual != expected {
                return Err(format!(
                    "Checksum mismatch for {}: expected {}, got {}",
                    file.name, expected, actual
                )
                .into());
            }
        }

        // Atomic write: write to temp then rename
        std::fs::write(&tmp_path, &bytes)?;
        std::fs::rename(&tmp_path, &local_path)?;

        self.manifest.upsert_entry(&ManifestEntry {
            remote_id: file.id.clone(),
            entity_type: "file".into(),
            remote_path: file.name.clone(),
            local_path: local_path.to_string_lossy().to_string(),
            remote_version: file.version,
            checksum: file.checksum.clone(),
            size: file.size,
            synced_at: chrono::Utc::now().to_rfc3339(),
        })?;

        log::info!("Downloaded: {}", file.name);
        Ok(())
    }

    /// Process pending local filesystem changes (from the watcher) and push
    /// them to the server. Returns the number of server-side operations issued.
    ///
    /// Batches events so that a delete followed by a create of the same
    /// content (by checksum) is dispatched as a single rename/move,
    /// preserving version history and avoiding redundant upload bytes.
    pub async fn push_local_changes(
        &mut self,
        changes: &[super::watcher::FsChange],
    ) -> Result<usize, Box<dyn std::error::Error>> {
        use super::uploader;
        use super::watcher::{FsChange, FsChangeKind};

        if self.paused {
            return Ok(0);
        }

        let local_root = Path::new(&self.local_root).to_path_buf();

        // Snapshot the excluded local-path prefixes once so each change-path
        // check is an O(excluded) compare instead of an O(excluded) SQL round
        // trip. Typical workspaces have only a handful of exclusions.
        let excluded_prefixes = self.manifest.list_excluded_local_paths()?;

        // Filter out paths outside sync root, our manifest db, and anything
        // rooted under an excluded folder.
        let relevant: Vec<&FsChange> = changes
            .iter()
            .filter(|c| {
                let p = Path::new(&c.path);
                if !p.starts_with(&local_root) || p.ends_with(".selfbox-sync.db") {
                    return false;
                }
                !is_under_any_prefix(&c.path, &excluded_prefixes)
            })
            .collect();

        // Pass 1: collect pending deletes. Separate file-deletes (keyed by
        // checksum for file-rename matching) from folder-deletes (matched
        // later by descendant presence).
        let mut pending_deletes: HashMap<String, super::manifest::ManifestEntry> = HashMap::new();
        let mut pending_folder_deletes: Vec<super::manifest::ManifestEntry> = Vec::new();
        let mut orphan_deletes: Vec<String> = Vec::new();

        for change in &relevant {
            if matches!(change.kind, FsChangeKind::Deleted) {
                let path = Path::new(&change.path);
                match uploader::find_by_local_path(&self.manifest, path) {
                    Ok(Some(entry)) => {
                        if entry.entity_type == "folder" {
                            pending_folder_deletes.push(entry);
                        } else if let Some(sum) = entry.checksum.clone() {
                            pending_deletes.insert(sum, entry);
                        } else {
                            orphan_deletes.push(entry.remote_id);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => log::warn!("Lookup failed for {:?}: {}", path, e),
                }
            }
        }

        let mut ops = 0;

        // Pass 2a: for each folder create, first check if it matches a pending
        // folder delete (a rename or move). Otherwise create new.
        // Sorted by path depth so ancestors process before descendants.
        let mut folder_creates: Vec<&Path> = relevant
            .iter()
            .filter(|c| matches!(c.kind, FsChangeKind::Created))
            .map(|c| Path::new(&c.path))
            .filter(|p| p.is_dir())
            .collect();
        folder_creates.sort_by_key(|p| p.components().count());

        for path in folder_creates {
            // Skip if already tracked (re-emitted event)
            if matches!(uploader::find_by_local_path(&self.manifest, path), Ok(Some(_))) {
                continue;
            }

            // Match this create to a pending folder delete by checking whether
            // the old folder's tracked descendants are now present under the
            // new path. If so, it's a rename/move.
            if let Some(idx) = pending_folder_deletes
                .iter()
                .position(|old| folder_descendants_moved(&self.manifest, &old.local_path, path))
            {
                let old_entry = pending_folder_deletes.remove(idx);
                let kind = activity_kind_for_path_change(&old_entry.local_path, path);
                let entity_id = old_entry.remote_id.clone();
                let display_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                match uploader::rename_or_move_folder(
                    &self.client,
                    &self.manifest,
                    &self.workspace_id,
                    &local_root,
                    old_entry,
                    path,
                )
                .await
                {
                    Ok(_) => {
                        ops += 1;
                        log::info!("Renamed/moved folder → {:?}", path);
                        self.push_activity(kind, "folder", entity_id, display_name);
                    }
                    Err(e) => log::warn!("Folder rename failed for {:?}: {}", path, e),
                }
                continue;
            }

            match uploader::create_local_folder(
                &self.client,
                &self.manifest,
                &self.workspace_id,
                &local_root,
                path,
            )
            .await
            {
                Ok(Some(entry)) => {
                    ops += 1;
                    log::info!("Created folder: {:?}", path);
                    self.push_activity(
                        "upload",
                        "folder",
                        entry.remote_id.clone(),
                        entry.remote_path,
                    );
                }
                Ok(None) => {}
                Err(e) => log::warn!("Folder create failed for {:?}: {}", path, e),
            }
        }

        // Pass 2b: handle file creates/modifies; match against pending deletes.
        for change in &relevant {
            if !matches!(
                change.kind,
                FsChangeKind::Created | FsChangeKind::Modified
            ) {
                continue;
            }
            let path = Path::new(&change.path);
            if !path.exists() || !path.is_file() {
                continue;
            }

            // Compute checksum up-front so we can match against pending deletes.
            let checksum = match uploader::checksum_file(path) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Checksum failed for {:?}: {}", path, e);
                    continue;
                }
            };

            if let Some(old_entry) = pending_deletes.remove(&checksum) {
                // Rename / move detected — same content, different path.
                let kind = activity_kind_for_path_change(&old_entry.local_path, path);
                let entity_id = old_entry.remote_id.clone();
                let display_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                match uploader::rename_or_move_file(
                    &self.client,
                    &self.manifest,
                    &self.workspace_id,
                    &local_root,
                    old_entry,
                    path,
                )
                .await
                {
                    Ok(_) => {
                        ops += 1;
                        log::info!("Renamed/moved: {:?}", path);
                        self.push_activity(kind, "file", entity_id, display_name);
                    }
                    Err(e) => log::warn!("Rename/move failed for {:?}: {}", path, e),
                }
            } else {
                // Fresh file — upload.
                match uploader::upload_local_file(
                    &self.client,
                    &self.manifest,
                    &self.workspace_id,
                    &local_root,
                    path,
                    &self.device_name,
                )
                .await
                {
                    Ok(uploader::UploadOutcome::Uploaded(entry)) => {
                        ops += 1;
                        self.push_activity(
                            "upload",
                            "file",
                            entry.remote_id.clone(),
                            entry.remote_path,
                        );
                    }
                    Ok(uploader::UploadOutcome::Unchanged) => {}
                    Ok(uploader::UploadOutcome::Conflicted {
                        remote_id,
                        local_copy,
                        current_version,
                    }) => {
                        match self
                            .resolve_upload_conflict(&remote_id, current_version)
                            .await
                        {
                            Ok(file_name) => {
                                self.conflicts.push(ConflictNotice {
                                    side: "local",
                                    file_name,
                                    conflict_path: local_copy.to_string_lossy().into(),
                                });
                                ops += 1;
                            }
                            Err(e) => log::warn!(
                                "Failed to recover after upload conflict for {:?}: {}",
                                path,
                                e
                            ),
                        }
                    }
                    Err(e) => log::warn!("Upload failed for {:?}: {}", path, e),
                }
            }
        }

        // Pass 3: any leftover pending deletes are real deletes.
        let drained_deletes: Vec<super::manifest::ManifestEntry> =
            pending_deletes.drain().map(|(_, e)| e).collect();
        for entry in drained_deletes {
            let entity_id = entry.remote_id.clone();
            let display_name = entry.remote_path.clone();
            if let Err(e) = uploader::delete_remote(
                &self.client,
                &self.manifest,
                &self.workspace_id,
                &entity_id,
            )
            .await
            {
                log::warn!("Delete failed for {}: {}", entity_id, e);
            } else {
                ops += 1;
                self.push_activity("delete", "file", entity_id, display_name);
            }
        }

        for remote_id in orphan_deletes {
            if let Err(e) = uploader::delete_remote(
                &self.client,
                &self.manifest,
                &self.workspace_id,
                &remote_id,
            )
            .await
            {
                log::warn!("Delete failed for {}: {}", remote_id, e);
            } else {
                ops += 1;
                // Orphan deletes don't carry a name (no manifest entry held a
                // checksum), so the activity row would be a useless "" — skip.
            }
        }

        // Any folder deletes that weren't matched to a rename are real deletes.
        let drained_folder_deletes: Vec<super::manifest::ManifestEntry> =
            pending_folder_deletes.drain(..).collect();
        for entry in drained_folder_deletes {
            let entity_id = entry.remote_id.clone();
            let display_name = entry.remote_path.clone();
            if let Err(e) = uploader::delete_remote(
                &self.client,
                &self.manifest,
                &self.workspace_id,
                &entity_id,
            )
            .await
            {
                log::warn!("Folder delete failed for {}: {}", entity_id, e);
            } else {
                ops += 1;
                self.push_activity("delete", "folder", entity_id, display_name);
            }
        }

        Ok(ops)
    }

    pub fn local_root(&self) -> &str {
        &self.local_root
    }

    /// Count pending journal entries. Useful for tests + UI status.
    pub fn pending_op_count(&self) -> Result<usize, Box<dyn std::error::Error>> {
        Ok(self.manifest.list_pending_ops()?.len())
    }

    /// Expose the current journal entries. Kept public for integration
    /// tests that need to assert post-replay state.
    pub fn list_pending_ops_for_test(
        &self,
    ) -> Result<Vec<super::manifest::PendingOp>, Box<dyn std::error::Error>> {
        Ok(self.manifest.list_pending_ops()?)
    }

    /// Replay any mutation that was journaled before a crash or network
    /// drop. Each entry carries the original request body including an
    /// idempotency key — the server returns the cached response if the
    /// mutation already applied on a prior attempt, so replaying is safe.
    /// Rows are cleared on success; on non-retryable failures we log and
    /// keep the entry so the user can inspect. Called from `start_sync`.
    pub async fn replay_pending_ops(
        &mut self,
    ) -> Result<usize, Box<dyn std::error::Error>> {
        let ops = self.manifest.list_pending_ops()?;
        if ops.is_empty() {
            return Ok(0);
        }

        log::info!("Replaying {} pending op(s) from journal", ops.len());
        let mut replayed = 0usize;
        for op in ops {
            let payload: serde_json::Value = match serde_json::from_str(&op.payload) {
                Ok(v) => v,
                Err(e) => {
                    log::warn!(
                        "Skipping malformed pending op {}: {}",
                        op.idempotency_key,
                        e
                    );
                    continue;
                }
            };

            match self.client.replay_mutation(&op.endpoint, &payload).await {
                Ok(_) => {
                    self.manifest.delete_pending_op(&op.idempotency_key)?;
                    replayed += 1;
                    log::info!(
                        "Replayed {} ({})",
                        op.op_kind,
                        op.idempotency_key
                    );
                }
                Err(e) => {
                    // Leave the row in place; it'll try again on next
                    // restart. Non-retryable errors surface in logs so the
                    // user can see something is wrong.
                    self.manifest
                        .increment_pending_op_attempts(&op.idempotency_key)
                        .ok();
                    log::warn!(
                        "Replay failed for {} ({}): {}",
                        op.op_kind,
                        op.idempotency_key,
                        e
                    );
                }
            }
        }
        Ok(replayed)
    }

    // ── Selective sync ────────────────────────────────────────────────

    pub fn list_excluded_folders(
        &self,
    ) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        Ok(self.manifest.list_excluded_folder_ids()?)
    }

    /// Apply a new exclusion set. For each folder newly added to the set,
    /// delete its local subtree on disk and purge the matching manifest
    /// entries. For each folder removed from the set, just drop the
    /// exclusion record; the next poll or bootstrap will pull its contents.
    pub async fn set_excluded_folders(
        &mut self,
        new_ids: &[String],
    ) -> Result<(), Box<dyn std::error::Error>> {
        use std::collections::HashSet;
        let current: HashSet<String> =
            self.manifest.list_excluded_folder_ids()?.into_iter().collect();
        let new_set: HashSet<String> = new_ids.iter().cloned().collect();

        let newly_excluded: Vec<String> =
            new_set.difference(&current).cloned().collect();
        let newly_included_count = current.difference(&new_set).count();

        // Newly-included: drop from excluded_folders.
        for id in current.difference(&new_set) {
            self.manifest.include_folder(id)?;
        }

        // Some folders the user is excluding may not be in the manifest
        // (e.g. they existed on the server but were never materialized —
        // typical after a re-link where sync never completed). We still
        // need to record the exclusion so later toggles see a diff and
        // re-inclusion triggers a fetch. Look those up via the server's
        // folder tree so we at least have a meaningful local_path.
        let missing: Vec<&String> = newly_excluded
            .iter()
            .filter(|id| {
                matches!(self.manifest.get_entry(id), Ok(None))
            })
            .collect();
        let server_folder_paths = if missing.is_empty() {
            None
        } else {
            // One round-trip to the server resolves local_paths for every
            // missing id at once. We deliberately don't materialize here
            // (no downloads) — exclusion is a "don't pull" directive.
            let snapshot = self.client.bootstrap(&self.workspace_id).await?;
            Some(self.build_folder_paths(&snapshot.folders))
        };

        // Newly-excluded: resolve local path, delete on disk, remove
        // manifest entries, insert into excluded_folders.
        for id in &newly_excluded {
            let local_path = match self.manifest.get_entry(id)? {
                Some(e) => e.local_path,
                None => {
                    // Fall back to the server-derived path.
                    match server_folder_paths
                        .as_ref()
                        .and_then(|m| m.get(id))
                    {
                        Some(p) => p.to_string_lossy().to_string(),
                        None => {
                            log::warn!(
                                "set_excluded_folders: folder {} not on server either; recording orphan exclusion",
                                id
                            );
                            // Still record — uses the id as a stable
                            // marker so future toggles see it.
                            self.manifest.exclude_folder(id, "")?;
                            continue;
                        }
                    }
                }
            };

            // Best-effort disk cleanup. If the folder is already gone, log
            // and continue — the important thing is recording the
            // exclusion so future sync skips it.
            let path = Path::new(&local_path);
            if path.exists() {
                if let Err(e) = std::fs::remove_dir_all(path) {
                    log::warn!(
                        "Could not remove {} on exclude: {}",
                        local_path,
                        e
                    );
                }
            }

            self.manifest.remove_entries_under(&local_path)?;
            self.manifest.exclude_folder(id, &local_path)?;
            log::info!("Excluded folder {} ({})", id, local_path);
        }

        // If any folder flipped from excluded to included, re-bootstrap so
        // its contents come down. `bootstrap` is now idempotent — files
        // already synced with matching checksum + version are skipped.
        if newly_included_count > 0 {
            log::info!(
                "Re-including {} folder(s); re-bootstrapping to pull contents",
                newly_included_count
            );
            self.bootstrap().await?;
        }

        Ok(())
    }

    /// Walk the sync root, diff against the manifest, and synthesize a batch
    /// of FS events so that any drift since the app was last running gets
    /// pushed to the server. This catches renames, deletions, and new files
    /// that happened while the app was closed — things the live watcher
    /// cannot see retroactively.
    ///
    /// Deletes are only synthesized for files that disappeared from disk
    /// (we do NOT currently reconcile offline remote changes here — that's
    /// what `poll_changes` covers via the server's change feed).
    pub async fn reconcile_from_disk(
        &mut self,
    ) -> Result<usize, Box<dyn std::error::Error>> {
        use super::watcher::{FsChange, FsChangeKind};

        let root = Path::new(&self.local_root).to_path_buf();
        if !root.exists() {
            return Ok(0);
        }

        // Walk all files under the sync root (skipping dotfiles and our db).
        let mut disk_paths: Vec<PathBuf> = Vec::new();
        walk_files(&root, &mut disk_paths)?;
        let disk_set: std::collections::HashSet<String> = disk_paths
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        let manifest_files = self.manifest.list_file_entries()?;
        let manifest_paths: std::collections::HashSet<String> = manifest_files
            .iter()
            .map(|e| e.local_path.clone())
            .collect();

        // Pre-compute excluded prefixes so we don't synthesize events for
        // paths the engine would filter out anyway — plus, if a user has a
        // lot of junk sitting inside an excluded folder on disk, this
        // avoids noisy per-file log lines.
        let excluded_prefixes = self.manifest.list_excluded_local_paths()?;

        let mut synth: Vec<FsChange> = Vec::new();

        // Tracked entries whose local file is gone → synthesize a Deleted.
        // push_local_changes pass 1 puts these into pending_deletes keyed by
        // checksum, so pass 2b can match them with untracked disk files for
        // rename detection.
        for entry in &manifest_files {
            if !disk_set.contains(&entry.local_path)
                && !is_under_any_prefix(&entry.local_path, &excluded_prefixes)
            {
                synth.push(FsChange {
                    path: entry.local_path.clone(),
                    kind: FsChangeKind::Deleted,
                });
            }
        }

        // Disk files the manifest doesn't know about → synthesize a Created.
        for p in &disk_paths {
            let path_str = p.to_string_lossy().to_string();
            if !manifest_paths.contains(&path_str)
                && !is_under_any_prefix(&path_str, &excluded_prefixes)
            {
                synth.push(FsChange {
                    path: path_str,
                    kind: FsChangeKind::Created,
                });
            }
        }

        if synth.is_empty() {
            log::info!("Reconciliation: no drift detected");
            return Ok(0);
        }

        log::info!(
            "Reconciliation: synthesizing {} FS events from disk drift",
            synth.len()
        );
        self.push_local_changes(&synth).await
    }

    // ── Path resolution ───────────────────────────────────────────────

    fn build_folder_paths(
        &self,
        folders: &[FolderSnapshot],
    ) -> HashMap<String, PathBuf> {
        let by_id: HashMap<&str, &FolderSnapshot> =
            folders.iter().map(|f| (f.id.as_str(), f)).collect();

        let mut paths = HashMap::new();

        for folder in folders {
            let mut parts = vec![folder.name.as_str()];
            let mut current = folder;

            while let Some(pid) = &current.parent_id {
                if let Some(parent) = by_id.get(pid.as_str()) {
                    parts.push(&parent.name);
                    current = parent;
                } else {
                    break;
                }
            }

            parts.reverse();
            let mut path = PathBuf::from(&self.local_root);
            for part in parts {
                // Same sanitization as download_file/apply_created: server
                // names may contain chars Windows rejects.
                path.push(super::winfs::sanitize_for_local_fs(part));
            }
            paths.insert(folder.id.clone(), path);
        }

        paths
    }

    fn resolve_parent_path(&self, parent_id: Option<&str>) -> PathBuf {
        match parent_id {
            Some(pid) => {
                if let Ok(Some(entry)) = self.manifest.get_entry(pid) {
                    PathBuf::from(entry.local_path)
                } else {
                    PathBuf::from(&self.local_root)
                }
            }
            None => PathBuf::from(&self.local_root),
        }
    }

    fn compute_file_checksum(&self, path: &Path) -> Result<String, Box<dyn std::error::Error>> {
        let data = std::fs::read(path)?;
        let mut hasher = Sha256::new();
        hasher.update(&data);
        Ok(format!("{:x}", hasher.finalize()))
    }
}

/// Pick "rename" vs "move" for an activity entry based on whether only the
/// basename changed (rename) or the parent directory changed (move).
fn activity_kind_for_path_change(old_local_path: &str, new_path: &Path) -> &'static str {
    let old_parent = Path::new(old_local_path).parent();
    let new_parent = new_path.parent();
    if old_parent == new_parent {
        "rename"
    } else {
        "move"
    }
}

/// True if `path` equals or sits under any path in `prefixes`. Used by
/// selective-sync filtering — excluded folders are stored as local_path
/// strings in the manifest; any FS event or reconciliation walk whose path
/// starts with one of them should be ignored.
fn is_under_any_prefix(path: &str, prefixes: &[String]) -> bool {
    let sep = std::path::MAIN_SEPARATOR;
    prefixes.iter().any(|prefix| {
        if path == prefix.as_str() {
            return true;
        }
        // Require a separator after the prefix so /foo doesn't match /foobar.
        path.starts_with(prefix.as_str())
            && path.as_bytes().get(prefix.len()) == Some(&(sep as u8))
    })
}

/// Given the full folder tree from a bootstrap response and an initial set
/// of explicitly-excluded folder ids, return every folder id that sits at
/// or below any exclusion. A flat `HashSet` over the result lets the caller
/// do O(1) lookups while iterating folders/files.
fn compute_excluded_closure(
    folders: &[FolderSnapshot],
    explicit_excluded: &std::collections::HashSet<String>,
) -> std::collections::HashSet<String> {
    use std::collections::HashSet;
    let parent_of: HashMap<&str, Option<&str>> = folders
        .iter()
        .map(|f| (f.id.as_str(), f.parent_id.as_deref()))
        .collect();

    let mut excluded: HashSet<String> = explicit_excluded.clone();
    // Iterate until no more additions — folders arrive from the server in
    // insertion order, not topological, so one pass may not catch a
    // great-grandchild whose grandparent becomes excluded later in the loop.
    loop {
        let before = excluded.len();
        for folder in folders {
            if excluded.contains(&folder.id) {
                continue;
            }
            let mut cur = folder.parent_id.as_deref();
            while let Some(pid) = cur {
                if excluded.contains(pid) {
                    excluded.insert(folder.id.clone());
                    break;
                }
                cur = parent_of.get(pid).copied().flatten();
            }
        }
        if excluded.len() == before {
            break;
        }
    }
    excluded
}

/// Recursively collect every regular file under `dir`, skipping dotfiles and
/// the manifest database. Used by `reconcile_from_disk`.
fn walk_files(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if name.starts_with('.') || name == ".selfbox-sync.db" {
            continue;
        }
        if path.is_dir() {
            walk_files(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

/// Decide whether an old folder's manifest descendants appear under the
/// new path on disk, indicating the folder was renamed/moved rather than
/// deleted. Returns true if the old folder had descendants and ALL of them
/// exist at their rewritten positions, or if the old folder had no tracked
/// descendants (empty tracked folder).
fn folder_descendants_moved(
    manifest: &super::manifest::SyncManifest,
    old_path: &str,
    new_path: &std::path::Path,
) -> bool {
    let Ok(descendants) = manifest.find_descendants(old_path) else {
        return false;
    };
    if descendants.is_empty() {
        return true;
    }
    let new_path_str = new_path.to_string_lossy();
    descendants.iter().all(|d| {
        let rewritten = d.local_path.replacen(old_path, &new_path_str, 1);
        std::path::Path::new(&rewritten).exists()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activity_kind_picks_rename_when_only_basename_changes() {
        let sep = std::path::MAIN_SEPARATOR;
        let old = format!("{sep}root{sep}docs{sep}before.txt");
        let new = PathBuf::from(format!("{sep}root{sep}docs{sep}after.txt"));
        assert_eq!(activity_kind_for_path_change(&old, &new), "rename");
    }

    #[test]
    fn activity_kind_picks_move_when_parent_changes() {
        let sep = std::path::MAIN_SEPARATOR;
        let old = format!("{sep}root{sep}docs{sep}note.md");
        let new = PathBuf::from(format!("{sep}root{sep}archive{sep}note.md"));
        assert_eq!(activity_kind_for_path_change(&old, &new), "move");
    }
}
