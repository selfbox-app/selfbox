use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::api::client::{ApiError, SelfboxClient};
use super::conflicts::write_conflict_copy;
use super::manifest::{ManifestEntry, PendingOp, SyncManifest};

/// Generate a fresh idempotency key. Uuid v4 is collision-resistant enough
/// for this purpose — the server only stores keys for ~24 h.
fn new_idempotency_key() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Insert a pending-op row before a mutation is sent. If the process
/// crashes mid-request, `replay_pending_ops` will re-issue the mutation
/// with the same key on next startup; the server dedupes.
fn journal(
    manifest: &SyncManifest,
    op_kind: &str,
    endpoint: &str,
    payload: &serde_json::Value,
    key: &str,
) -> Result<(), UploadError> {
    manifest
        .insert_pending_op(&PendingOp {
            idempotency_key: key.to_string(),
            op_kind: op_kind.to_string(),
            endpoint: endpoint.to_string(),
            payload: serde_json::to_string(payload)
                .unwrap_or_else(|_| "{}".into()),
            created_at: chrono::Utc::now().to_rfc3339(),
            attempts: 0,
        })
        .map_err(UploadError::Db)
}

/// Clear the pending-op row once the server has confirmed the mutation
/// succeeded (which, thanks to idempotency, also covers "the server already
/// applied this on a prior attempt and we got back the cached response").
fn settle(manifest: &SyncManifest, key: &str) -> Result<(), UploadError> {
    manifest.delete_pending_op(key).map_err(UploadError::Db)
}

/// Outcome of a content-push attempt. `Conflicted` means the server rejected
/// the write because someone else modified the file since our cached version;
/// the local bytes have been preserved at `local_copy` and the caller must
/// pull the authoritative remote to restore the original path.
#[derive(Debug)]
pub enum UploadOutcome {
    Uploaded(ManifestEntry),
    /// No-op: the local content matched the manifest checksum.
    Unchanged,
    Conflicted {
        remote_id: String,
        local_copy: PathBuf,
        current_version: i64,
    },
}

/// Uploads a single local file to the server, creating it if new or
/// overwriting if changed.
///
/// `device_name` is used to generate a conflict filename if the server rejects
/// a content update because someone else bumped the file's version.
pub async fn upload_local_file(
    client: &SelfboxClient,
    manifest: &SyncManifest,
    workspace_id: &str,
    local_root: &Path,
    local_path: &Path,
    device_name: &str,
) -> Result<UploadOutcome, UploadError> {
    let bytes = std::fs::read(local_path).map_err(UploadError::Io)?;
    let checksum = sha256_hex(&bytes);
    let size = bytes.len() as i64;

    let file_name = local_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| UploadError::BadPath(local_path.to_path_buf()))?
        .to_string();

    // Skip dotfiles and our manifest db
    if file_name.starts_with('.') || file_name == ".selfbox-sync.db" {
        return Ok(UploadOutcome::Unchanged);
    }

    // If we already have this file in the manifest...
    if let Some(existing_id) = find_entry_by_path(manifest, local_path)? {
        if let Ok(Some(entry)) = manifest.get_entry(&existing_id) {
            // Same checksum → no change
            if entry.checksum.as_deref() == Some(&checksum) {
                return Ok(UploadOutcome::Unchanged);
            }
            // Content changed — push a content update, preserving fileId + version history
            return update_local_file_content(
                client,
                manifest,
                workspace_id,
                entry,
                &bytes,
                &checksum,
                size,
                local_path,
                device_name,
            )
            .await;
        }
    }

    // Resolve the parent folder's remote ID (None = workspace root)
    let folder_id = resolve_parent_folder_id(manifest, local_root, local_path)?;

    let content_type = mime_guess::from_path(local_path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    // Initiate upload
    let initiate = client
        .initiate_upload(
            workspace_id,
            &file_name,
            size,
            &content_type,
            folder_id.as_deref(),
            &checksum,
        )
        .await
        .map_err(UploadError::Api)?;

    let file_id = initiate["fileId"].as_str().unwrap_or_default().to_string();
    let strategy = initiate["strategy"].as_str().unwrap_or("");

    let (upload_id, parts_for_complete) = match strategy {
        "presigned-put" => {
            let url = initiate["presignedUrl"].as_str().unwrap_or("");
            client
                .upload_presigned(url, bytes, &content_type)
                .await
                .map_err(UploadError::Api)?;
            (None, None)
        }
        "multipart" => {
            use super::multipart;
            let (upload_id, part_size, parts) =
                multipart::parse_multipart_response(&initiate).map_err(UploadError::Api)?;
            let chunks = multipart::split_into_parts(&bytes, part_size);
            let completed = multipart::upload_all_parts(client, parts, chunks, &content_type)
                .await
                .map_err(UploadError::Api)?;
            let parts_json = serde_json::to_value(
                completed
                    .into_iter()
                    .map(|p| {
                        serde_json::json!({
                            "partNumber": p.part_number,
                            "etag": p.etag,
                        })
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();
            (Some(upload_id), Some(parts_json))
        }
        "server-buffered" => {
            // Local-disk storage backend — bytes flow through our own
            // server. The server resolves the destination from the file
            // row, so we don't need to send the path (and shouldn't —
            // user-supplied filenames may contain non-ASCII bytes that
            // get mangled when carried in an HTTP header value).
            client
                .stream_upload(workspace_id, &file_id, None, bytes, &content_type)
                .await
                .map_err(UploadError::Api)?;
            (None, None)
        }
        other => {
            return Err(UploadError::Unsupported(format!(
                "Unknown upload strategy: {}",
                other
            )));
        }
    };

    // Complete upload — server verifies checksum here
    let completed = client
        .complete_upload(
            workspace_id,
            &file_id,
            upload_id.as_deref(),
            parts_for_complete.as_ref(),
        )
        .await
        .map_err(UploadError::Api)?;

    let version = completed["version"].as_i64().unwrap_or(1);

    let entry = ManifestEntry {
        remote_id: file_id,
        entity_type: "file".into(),
        remote_path: file_name.clone(),
        local_path: local_path.to_string_lossy().to_string(),
        remote_version: version,
        checksum: Some(checksum),
        size,
        synced_at: chrono::Utc::now().to_rfc3339(),
    };

    manifest.upsert_entry(&entry).map_err(UploadError::Db)?;

    Ok(UploadOutcome::Uploaded(entry))
}

/// Delete a remote entry by its manifest ID, using the stored version for optimistic locking.
pub async fn delete_remote(
    client: &SelfboxClient,
    manifest: &SyncManifest,
    workspace_id: &str,
    remote_id: &str,
) -> Result<(), UploadError> {
    let entry = manifest
        .get_entry(remote_id)
        .map_err(UploadError::Db)?
        .ok_or_else(|| UploadError::NotInManifest(remote_id.to_string()))?;

    let key = new_idempotency_key();
    let (op_kind, endpoint, payload) = match entry.entity_type.as_str() {
        "file" => (
            "delete_file",
            "/files/delete",
            serde_json::json!({
                "workspaceId": workspace_id,
                "id": remote_id,
                "expectedVersion": entry.remote_version,
                "idempotencyKey": key,
            }),
        ),
        "folder" => (
            "delete_folder",
            "/folders/delete",
            serde_json::json!({
                "workspaceId": workspace_id,
                "id": remote_id,
                "expectedVersion": entry.remote_version,
                "idempotencyKey": key,
            }),
        ),
        _ => return Ok(()),
    };
    journal(manifest, op_kind, endpoint, &payload, &key)?;

    let result = match entry.entity_type.as_str() {
        "file" => client
            .delete_file(workspace_id, remote_id, entry.remote_version, Some(&key))
            .await
            .map_err(UploadError::Api),
        "folder" => client
            .delete_folder(workspace_id, remote_id, entry.remote_version, Some(&key))
            .await
            .map_err(UploadError::Api),
        _ => unreachable!(),
    };

    if result.is_ok() {
        settle(manifest, &key)?;
        manifest.remove_entry(remote_id).map_err(UploadError::Db)?;
    } else if let Err(UploadError::Api(ApiError::VersionConflict { .. })) = &result {
        // Server version is ahead — our pending-op is now stale and not
        // worth retrying. Clear the journal entry, let the next poll
        // reconcile.
        settle(manifest, &key)?;
        log::warn!(
            "Version conflict on delete of {}; will reconcile on next poll",
            remote_id
        );
    } else {
        manifest
            .increment_pending_op_attempts(&key)
            .map_err(UploadError::Db)?;
    }

    result.map(|_| ())
}

// ── Helpers ───────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum UploadError {
    #[error("Filesystem error: {0}")]
    Io(#[from] std::io::Error),

    #[error("API error: {0}")]
    Api(ApiError),

    #[error("Database error: {0}")]
    Db(rusqlite::Error),

    #[error("Invalid path: {0:?}")]
    BadPath(PathBuf),

    #[error("Not in manifest: {0}")]
    NotInManifest(String),

    #[error("Unsupported: {0}")]
    Unsupported(String),
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn mk_manifest() -> (SyncManifest, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let m = SyncManifest::open(db_path.to_str().unwrap()).unwrap();
        (m, dir)
    }

    fn mk_entry(remote_id: &str, local_path: &str, entity: &str) -> ManifestEntry {
        ManifestEntry {
            remote_id: remote_id.into(),
            entity_type: entity.into(),
            remote_path: Path::new(local_path)
                .file_name()
                .unwrap()
                .to_string_lossy()
                .into(),
            local_path: local_path.into(),
            remote_version: 1,
            checksum: Some("abc".into()),
            size: 0,
            synced_at: "2026-04-12T00:00:00Z".into(),
        }
    }

    #[test]
    fn sha256_hex_is_stable_and_64_chars() {
        let a = sha256_hex(b"hello");
        let b = sha256_hex(b"hello");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert_ne!(sha256_hex(b"hello"), sha256_hex(b"world"));
    }

    #[test]
    fn checksum_file_matches_bytes_hash() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("f.txt");
        std::fs::write(&path, b"hello world").unwrap();
        assert_eq!(checksum_file(&path).unwrap(), sha256_hex(b"hello world"));
    }

    #[test]
    fn find_by_local_path_returns_entry_when_present() {
        let (m, _dir) = mk_manifest();
        m.upsert_entry(&mk_entry("f1", "/root/a.txt", "file")).unwrap();
        let found = find_by_local_path(&m, Path::new("/root/a.txt")).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().remote_id, "f1");
    }

    #[test]
    fn find_by_local_path_returns_none_for_unknown() {
        let (m, _dir) = mk_manifest();
        assert!(find_by_local_path(&m, Path::new("/root/nope")).unwrap().is_none());
    }

    #[test]
    fn resolve_parent_folder_id_returns_none_at_sync_root() {
        let (m, _dir) = mk_manifest();
        let parent =
            resolve_parent_folder_id(&m, Path::new("/root"), Path::new("/root/file.txt"))
                .unwrap();
        assert_eq!(parent, None);
    }

    #[test]
    fn resolve_parent_folder_id_finds_parent_folder_entry() {
        let (m, _dir) = mk_manifest();
        m.upsert_entry(&mk_entry("folder-1", "/root/Docs", "folder")).unwrap();
        let parent =
            resolve_parent_folder_id(&m, Path::new("/root"), Path::new("/root/Docs/a.txt"))
                .unwrap();
        assert_eq!(parent.as_deref(), Some("folder-1"));
    }
}

/// Find the remote ID for a file at a given local path.
fn find_entry_by_path(
    manifest: &SyncManifest,
    path: &Path,
) -> Result<Option<String>, UploadError> {
    let path_str = path.to_string_lossy();
    let conn = manifest.connection();
    let mut stmt = conn
        .prepare("SELECT remote_id FROM entries WHERE local_path = ?1 LIMIT 1")
        .map_err(UploadError::Db)?;
    let mut rows = stmt.query([path_str.as_ref()]).map_err(UploadError::Db)?;
    match rows.next().map_err(UploadError::Db)? {
        Some(row) => Ok(Some(row.get::<_, String>(0).map_err(UploadError::Db)?)),
        None => Ok(None),
    }
}

/// Public helper for the engine: get the full manifest entry by local path.
pub fn find_by_local_path(
    manifest: &SyncManifest,
    path: &Path,
) -> Result<Option<ManifestEntry>, UploadError> {
    let Some(remote_id) = find_entry_by_path(manifest, path)? else {
        return Ok(None);
    };
    manifest.get_entry(&remote_id).map_err(UploadError::Db)
}

/// Compute the SHA-256 of a local file.
pub fn checksum_file(path: &Path) -> Result<String, UploadError> {
    let bytes = std::fs::read(path).map_err(UploadError::Io)?;
    Ok(sha256_hex(&bytes))
}

/// Push a local content change for a file we already sync, preserving
/// the server's file id and version chain.
///
/// Returns `UploadOutcome::Conflicted` if the server rejected the write with
/// a version conflict — the local bytes have already been moved to a sibling
/// conflict file by the time this returns, so the caller only needs to pull
/// the authoritative remote to restore `local_path`.
async fn update_local_file_content(
    client: &SelfboxClient,
    manifest: &SyncManifest,
    workspace_id: &str,
    entry: ManifestEntry,
    bytes: &[u8],
    checksum: &str,
    size: i64,
    local_path: &Path,
    device_name: &str,
) -> Result<UploadOutcome, UploadError> {
    let content_type = mime_guess::from_path(local_path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();

    // Initiate — the server verifies version and reserves a pending path.
    let initiated = match client
        .initiate_update(
            workspace_id,
            &entry.remote_id,
            size,
            &content_type,
            checksum,
            entry.remote_version,
        )
        .await
    {
        Ok(v) => v,
        Err(ApiError::VersionConflict {
            current_version, ..
        }) => {
            // Remote moved ahead. Preserve our bytes as a sibling conflict
            // file so the next watcher tick uploads them as a fresh file, and
            // hand back the current server version so the caller can fetch
            // the authoritative copy.
            let conflict_path = write_conflict_copy(local_path, device_name)
                .map_err(UploadError::Io)?;
            log::warn!(
                "Upload conflict on {:?}: remote version {}, local saved as {:?}",
                local_path,
                current_version,
                conflict_path
            );
            return Ok(UploadOutcome::Conflicted {
                remote_id: entry.remote_id,
                local_copy: conflict_path,
                current_version,
            });
        }
        Err(e) => return Err(UploadError::Api(e)),
    };

    let pending_path = initiated["storagePath"].as_str().unwrap_or("").to_string();
    let strategy = initiated["strategy"].as_str().unwrap_or("");

    let (upload_id, parts_for_complete) = match strategy {
        "presigned-put" => {
            let url = initiated["presignedUrl"].as_str().unwrap_or("");
            client
                .upload_presigned(url, bytes.to_vec(), &content_type)
                .await
                .map_err(UploadError::Api)?;
            (None, None)
        }
        "multipart" => {
            use super::multipart;
            let (upload_id, part_size, parts) =
                multipart::parse_multipart_response(&initiated).map_err(UploadError::Api)?;
            let chunks = multipart::split_into_parts(bytes, part_size);
            let completed = multipart::upload_all_parts(client, parts, chunks, &content_type)
                .await
                .map_err(UploadError::Api)?;
            let parts_json = serde_json::to_value(
                completed
                    .into_iter()
                    .map(|p| {
                        serde_json::json!({
                            "partNumber": p.part_number,
                            "etag": p.etag,
                        })
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap();
            (Some(upload_id), Some(parts_json))
        }
        "server-buffered" => {
            // Local-disk storage backend — stream the new bytes to the
            // pending path returned by initiate_update. The complete step
            // below will verify checksum and swap pending → live.
            // Pending paths are ASCII (`pending-<uuid>`), so the header
            // round-trip is safe.
            client
                .stream_upload(
                    workspace_id,
                    &entry.remote_id,
                    Some(&pending_path),
                    bytes.to_vec(),
                    &content_type,
                )
                .await
                .map_err(UploadError::Api)?;
            (None, None)
        }
        other => {
            return Err(UploadError::Unsupported(format!(
                "Unknown update strategy: {}",
                other
            )));
        }
    };

    let completed = client
        .complete_update(
            workspace_id,
            &entry.remote_id,
            &pending_path,
            upload_id.as_deref(),
            parts_for_complete.as_ref(),
        )
        .await
        .map_err(UploadError::Api)?;

    let new_version = completed["version"]
        .as_i64()
        .unwrap_or(entry.remote_version + 1);

    let updated = ManifestEntry {
        remote_version: new_version,
        checksum: Some(checksum.into()),
        size,
        synced_at: chrono::Utc::now().to_rfc3339(),
        ..entry
    };
    manifest.upsert_entry(&updated).map_err(UploadError::Db)?;

    log::info!("Updated content for {:?}", local_path);
    Ok(UploadOutcome::Uploaded(updated))
}

/// Rename or move an existing folder on the server, rewriting the manifest
/// entries for the folder and all its tracked descendants so their
/// local_paths point at the new location. The server handles only the
/// folder record itself; descendant files stay at their folder-relative
/// paths, so no per-file server calls are needed.
pub async fn rename_or_move_folder(
    client: &SelfboxClient,
    manifest: &SyncManifest,
    workspace_id: &str,
    local_root: &Path,
    old_entry: ManifestEntry,
    new_local_path: &Path,
) -> Result<ManifestEntry, UploadError> {
    let new_name = new_local_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| UploadError::BadPath(new_local_path.to_path_buf()))?
        .to_string();

    let old_parent = Path::new(&old_entry.local_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| local_root.to_path_buf());
    let new_parent = new_local_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| local_root.to_path_buf());

    let renamed = new_name != old_entry.remote_path;
    let moved = new_parent != old_parent;

    let mut version = old_entry.remote_version;

    if renamed {
        let key = new_idempotency_key();
        journal(
            manifest,
            "rename_folder",
            "/folders/rename",
            &serde_json::json!({
                "workspaceId": workspace_id,
                "id": old_entry.remote_id,
                "name": new_name,
                "expectedVersion": version,
                "idempotencyKey": key,
            }),
            &key,
        )?;
        match client
            .rename_folder(
                workspace_id,
                &old_entry.remote_id,
                &new_name,
                version,
                Some(&key),
            )
            .await
        {
            Ok(result) => {
                settle(manifest, &key)?;
                version = result["version"].as_i64().unwrap_or(version + 1);
            }
            Err(ApiError::VersionConflict { current_version, .. }) => {
                settle(manifest, &key)?;
                log::warn!(
                    "Version conflict on folder rename of {}; will reconcile on next poll",
                    old_entry.remote_id
                );
                version = current_version;
            }
            Err(e) => {
                manifest.increment_pending_op_attempts(&key).ok();
                return Err(UploadError::Api(e));
            }
        }
    }

    if moved {
        // Resolve the new parent folder's remote id (None = workspace root)
        let target_folder_id = if new_parent == local_root {
            None
        } else {
            find_entry_by_path(manifest, &new_parent)?
        };

        let key = new_idempotency_key();
        journal(
            manifest,
            "move_folder",
            "/folders/move",
            &serde_json::json!({
                "workspaceId": workspace_id,
                "id": old_entry.remote_id,
                "targetFolderId": target_folder_id,
                "expectedVersion": version,
                "idempotencyKey": key,
            }),
            &key,
        )?;

        match client
            .move_folder(
                workspace_id,
                &old_entry.remote_id,
                target_folder_id.as_deref(),
                version,
                Some(&key),
            )
            .await
        {
            Ok(result) => {
                settle(manifest, &key)?;
                version = result["version"].as_i64().unwrap_or(version + 1);
            }
            Err(ApiError::VersionConflict { current_version, .. }) => {
                settle(manifest, &key)?;
                log::warn!(
                    "Version conflict on folder move of {}; will reconcile on next poll",
                    old_entry.remote_id
                );
                version = current_version;
            }
            Err(e) => {
                manifest.increment_pending_op_attempts(&key).ok();
                return Err(UploadError::Api(e));
            }
        }
    }

    // Rewrite manifest: the folder entry itself and every descendant's
    // local_path need their old prefix replaced with the new prefix.
    let old_prefix = old_entry.local_path.clone();
    let new_prefix = new_local_path.to_string_lossy().to_string();

    let descendants = manifest
        .find_descendants(&old_prefix)
        .map_err(UploadError::Db)?;
    for d in descendants {
        let rewritten = d.local_path.replacen(&old_prefix, &new_prefix, 1);
        manifest
            .upsert_entry(&ManifestEntry {
                local_path: rewritten,
                ..d
            })
            .map_err(UploadError::Db)?;
    }

    let entry = ManifestEntry {
        remote_id: old_entry.remote_id.clone(),
        entity_type: "folder".into(),
        remote_path: new_name,
        local_path: new_prefix,
        remote_version: version,
        checksum: None,
        size: 0,
        synced_at: chrono::Utc::now().to_rfc3339(),
    };
    manifest.upsert_entry(&entry).map_err(UploadError::Db)?;

    Ok(entry)
}

/// Create a folder on the server that was created locally, and record it
/// in the manifest. Returns `Ok(None)` if skipped (hidden or already tracked).
pub async fn create_local_folder(
    client: &SelfboxClient,
    manifest: &SyncManifest,
    workspace_id: &str,
    local_root: &Path,
    local_path: &Path,
) -> Result<Option<ManifestEntry>, UploadError> {
    let name = local_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| UploadError::BadPath(local_path.to_path_buf()))?
        .to_string();

    // Skip hidden folders
    if name.starts_with('.') {
        return Ok(None);
    }

    // Skip if already tracked
    if find_entry_by_path(manifest, local_path)?.is_some() {
        return Ok(None);
    }

    let parent_id = resolve_parent_folder_id(manifest, local_root, local_path)?;

    let key = new_idempotency_key();
    journal(
        manifest,
        "create_folder",
        "/folders/create",
        &serde_json::json!({
            "workspaceId": workspace_id,
            "name": name,
            "parentId": parent_id,
            "idempotencyKey": key,
        }),
        &key,
    )?;
    let result = match client
        .create_folder(workspace_id, &name, parent_id.as_deref(), Some(&key))
        .await
    {
        Ok(v) => {
            settle(manifest, &key)?;
            v
        }
        Err(e) => {
            manifest.increment_pending_op_attempts(&key).ok();
            return Err(UploadError::Api(e));
        }
    };

    let remote_id = result["id"].as_str().unwrap_or_default().to_string();
    let version = result["version"].as_i64().unwrap_or(1);

    let entry = ManifestEntry {
        remote_id,
        entity_type: "folder".into(),
        remote_path: name,
        local_path: local_path.to_string_lossy().to_string(),
        remote_version: version,
        checksum: None,
        size: 0,
        synced_at: chrono::Utc::now().to_rfc3339(),
    };

    manifest.upsert_entry(&entry).map_err(UploadError::Db)?;
    Ok(Some(entry))
}

/// Apply a rename / move to the server, using the manifest entry's
/// stored version for optimistic locking. Updates the manifest in place.
pub async fn rename_or_move_file(
    client: &SelfboxClient,
    manifest: &SyncManifest,
    workspace_id: &str,
    local_root: &Path,
    old_entry: ManifestEntry,
    new_local_path: &Path,
) -> Result<ManifestEntry, UploadError> {
    let new_name = new_local_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| UploadError::BadPath(new_local_path.to_path_buf()))?
        .to_string();

    let old_parent = Path::new(&old_entry.local_path)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| local_root.to_path_buf());
    let new_parent = new_local_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| local_root.to_path_buf());

    let renamed = new_name != old_entry.remote_path;
    let moved = new_parent != old_parent;

    let mut version = old_entry.remote_version;

    // Rename first, if needed — may bump version
    if renamed {
        let key = new_idempotency_key();
        journal(
            manifest,
            "rename_file",
            "/files/rename",
            &serde_json::json!({
                "workspaceId": workspace_id,
                "id": old_entry.remote_id,
                "name": new_name,
                "expectedVersion": version,
                "idempotencyKey": key,
            }),
            &key,
        )?;
        match client
            .rename_file(
                workspace_id,
                &old_entry.remote_id,
                &new_name,
                version,
                Some(&key),
            )
            .await
        {
            Ok(result) => {
                settle(manifest, &key)?;
                version = result["version"].as_i64().unwrap_or(version + 1);
            }
            Err(ApiError::VersionConflict { current_version, .. }) => {
                settle(manifest, &key)?;
                log::warn!(
                    "Version conflict on rename of {}; will reconcile on next poll",
                    old_entry.remote_id
                );
                version = current_version;
            }
            Err(e) => {
                manifest.increment_pending_op_attempts(&key).ok();
                return Err(UploadError::Api(e));
            }
        }
    }

    // Move (parent change), if needed
    if moved {
        let target_folder_id =
            resolve_parent_folder_id(manifest, local_root, new_local_path)?;

        let key = new_idempotency_key();
        journal(
            manifest,
            "move_file",
            "/files/move",
            &serde_json::json!({
                "workspaceId": workspace_id,
                "id": old_entry.remote_id,
                "targetFolderId": target_folder_id,
                "expectedVersion": version,
                "idempotencyKey": key,
            }),
            &key,
        )?;
        match client
            .move_file(
                workspace_id,
                &old_entry.remote_id,
                target_folder_id.as_deref(),
                version,
                Some(&key),
            )
            .await
        {
            Ok(result) => {
                settle(manifest, &key)?;
                version = result["version"].as_i64().unwrap_or(version + 1);
            }
            Err(ApiError::VersionConflict { current_version, .. }) => {
                settle(manifest, &key)?;
                log::warn!(
                    "Version conflict on move of {}; will reconcile on next poll",
                    old_entry.remote_id
                );
                version = current_version;
            }
            Err(e) => {
                manifest.increment_pending_op_attempts(&key).ok();
                return Err(UploadError::Api(e));
            }
        }
    }

    let entry = ManifestEntry {
        remote_id: old_entry.remote_id.clone(),
        entity_type: old_entry.entity_type.clone(),
        remote_path: new_name,
        local_path: new_local_path.to_string_lossy().to_string(),
        remote_version: version,
        checksum: old_entry.checksum.clone(),
        size: old_entry.size,
        synced_at: chrono::Utc::now().to_rfc3339(),
    };
    manifest.upsert_entry(&entry).map_err(UploadError::Db)?;

    Ok(entry)
}

/// Walk up from the local file's directory and resolve the parent folder
/// in the manifest. Returns None if the file sits at the sync root.
fn resolve_parent_folder_id(
    manifest: &SyncManifest,
    local_root: &Path,
    local_path: &Path,
) -> Result<Option<String>, UploadError> {
    let parent = local_path.parent().ok_or_else(|| {
        UploadError::BadPath(local_path.to_path_buf())
    })?;

    // File is directly under sync root → no parent folder
    if parent == local_root {
        return Ok(None);
    }

    let parent_str = parent.to_string_lossy().to_string();
    let conn = manifest.connection();
    let mut stmt = conn
        .prepare(
            "SELECT remote_id FROM entries WHERE entity_type = 'folder' AND local_path = ?1 LIMIT 1",
        )
        .map_err(UploadError::Db)?;
    let mut rows = stmt.query([&parent_str]).map_err(UploadError::Db)?;
    match rows.next().map_err(UploadError::Db)? {
        Some(row) => Ok(Some(row.get::<_, String>(0).map_err(UploadError::Db)?)),
        None => Ok(None),
    }
}
