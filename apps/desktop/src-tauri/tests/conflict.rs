//! Integration tests for conflict handling on the sync engine.
//!
//! Two-writers scenario: the desktop's cached `remote_version` lags the
//! server. When the user edits locally and we try to push, the server
//! responds 409 version_conflict. The engine must:
//!   1. preserve the local bytes as a sibling `<name> (conflict from ...)` file,
//!   2. fetch the authoritative server snapshot,
//!   3. download it to the original path, and
//!   4. record a ConflictNotice for the UI.
//!
//! Run with: `cargo test --test conflict`

use selfbox_desktop_sync::api::client::SelfboxClient;
use selfbox_desktop_sync::sync::engine::SyncEngine;
use selfbox_desktop_sync::sync::manifest::{ManifestEntry, SyncManifest};
use selfbox_desktop_sync::sync::watcher::{FsChange, FsChangeKind};

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

fn seeded_manifest(entries: &[ManifestEntry]) -> (SyncManifest, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let m = SyncManifest::open(dir.path().join("m.db").to_str().unwrap()).unwrap();
    for e in entries {
        m.upsert_entry(e).unwrap();
    }
    (m, dir)
}

async fn new_engine(
    server_url: &str,
    manifest: SyncManifest,
    local_root: &std::path::Path,
) -> SyncEngine {
    let mut client = SelfboxClient::new(server_url);
    client.set_token("test-token".into());
    SyncEngine::new(
        client,
        manifest,
        "ws-1".into(),
        local_root.to_string_lossy().to_string(),
        "Test Device".into(),
    )
}

#[tokio::test]
async fn upload_version_conflict_saves_local_as_sibling_and_pulls_remote() {
    let sync_root = tempfile::tempdir().unwrap();
    let file_path = sync_root.path().join("notes.txt");

    // Desktop's cached snapshot: version 1, checksum of "old bytes"
    let old_bytes = b"old bytes";
    let old_checksum = sha256_hex(old_bytes);

    // User's new local edit
    let local_bytes = b"local changes";
    std::fs::write(&file_path, local_bytes).unwrap();

    // Server state (two versions ahead of what we have)
    let remote_bytes = b"remote changes";
    let remote_checksum = sha256_hex(remote_bytes);
    let remote_version = 3i64;

    let mut server = mockito::Server::new_async().await;

    // 1. Our push attempt hits 409 version_conflict.
    let initiate_update_mock = server
        .mock("POST", "/api/desktop/v1/files/update/initiate")
        .with_status(409)
        .with_header("content-type", "application/json")
        .with_body(format!(
            r#"{{"code":"version_conflict","entityId":"file-1","currentVersion":{remote_version}}}"#
        ))
        .expect(1)
        .create_async()
        .await;

    // 2. Engine calls get_file to fetch authoritative snapshot.
    let get_file_body = format!(
        r#"{{
            "id": "file-1",
            "folderId": null,
            "name": "notes.txt",
            "mimeType": "text/plain",
            "size": {size},
            "checksum": "{remote_checksum}",
            "status": "ready",
            "version": {remote_version},
            "createdAt": "2026-04-12T00:00:00Z",
            "updatedAt": "2026-04-12T00:00:00Z"
        }}"#,
        size = remote_bytes.len(),
    );
    let get_file_mock = server
        .mock("POST", "/api/desktop/v1/files/get")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(get_file_body)
        .expect(1)
        .create_async()
        .await;

    // 3. Engine then calls download-url + fetches the bytes.
    let storage_mock = server
        .mock("GET", "/blob/remote")
        .with_status(200)
        .with_body(remote_bytes.to_vec())
        .expect(1)
        .create_async()
        .await;

    let storage_url = format!("{}/blob/remote", server.url());
    let download_url_mock = server
        .mock("POST", "/api/desktop/v1/files/download-url")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(format!(r#"{{"url":"{storage_url}"}}"#))
        .expect(1)
        .create_async()
        .await;

    let (m, _db_dir) = seeded_manifest(&[ManifestEntry {
        remote_id: "file-1".into(),
        entity_type: "file".into(),
        remote_path: "notes.txt".into(),
        local_path: file_path.to_string_lossy().into(),
        remote_version: 1,
        checksum: Some(old_checksum),
        size: old_bytes.len() as i64,
        synced_at: "2026-04-12T00:00:00Z".into(),
    }]);
    let mut engine = new_engine(&server.url(), m, sync_root.path()).await;

    let changes = vec![FsChange {
        path: file_path.to_string_lossy().into(),
        kind: FsChangeKind::Modified,
    }];

    let ops = engine.push_local_changes(&changes).await.unwrap();
    assert_eq!(ops, 1, "expected exactly one conflict-resolution op");

    initiate_update_mock.assert_async().await;
    get_file_mock.assert_async().await;
    download_url_mock.assert_async().await;
    storage_mock.assert_async().await;

    // Original path now carries the remote bytes.
    let on_disk = std::fs::read(&file_path).unwrap();
    assert_eq!(on_disk, remote_bytes, "original path should match remote");

    // A sibling conflict file exists with our local bytes.
    let siblings: Vec<_> = std::fs::read_dir(sync_root.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let n = e.file_name().to_string_lossy().to_string();
            n != "notes.txt" && n.starts_with("notes (conflict from Test Device")
        })
        .collect();
    assert_eq!(siblings.len(), 1, "expected a single conflict sibling");
    let sibling_bytes = std::fs::read(siblings[0].path()).unwrap();
    assert_eq!(
        sibling_bytes, local_bytes,
        "conflict sibling should preserve our local bytes"
    );
    let sibling_name = siblings[0].file_name().to_string_lossy().to_string();
    assert!(sibling_name.ends_with(".txt"));

    // Engine exposes a ConflictNotice for lib.rs to emit.
    let notices = engine.drain_conflicts();
    assert_eq!(notices.len(), 1);
    assert_eq!(notices[0].side, "local");
    assert_eq!(notices[0].file_name, "notes.txt");
}
