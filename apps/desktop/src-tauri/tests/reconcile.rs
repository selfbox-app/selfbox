//! Integration tests for `SyncEngine::reconcile_from_disk`.
//!
//! Simulates drift that happened while the app was closed — a file renamed
//! on disk but not reflected in the manifest — and asserts that the engine
//! catches it on startup and emits the correct server-side operation.
//!
//! Run with: `cargo test --test reconcile`

use selfbox_desktop_sync::api::client::SelfboxClient;
use selfbox_desktop_sync::sync::engine::SyncEngine;
use selfbox_desktop_sync::sync::manifest::{ManifestEntry, SyncManifest};

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
async fn offline_rename_is_detected_as_a_single_rename() {
    // User renames demo.gif → demo-1.gif while the app is closed. On restart
    // the manifest still points at demo.gif; only demo-1.gif exists on disk.
    let sync_root = tempfile::tempdir().unwrap();
    let old_path = sync_root.path().join("demo.gif");
    let new_path = sync_root.path().join("demo-1.gif");

    let content = b"fake gif bytes";
    let checksum = sha256_hex(content);
    std::fs::write(&new_path, content).unwrap();

    let mut server = mockito::Server::new_async().await;

    let rename_mock = server
        .mock("POST", "/api/desktop/v1/files/rename")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{"id":"file-1","name":"demo-1.gif","version":2}"#)
        .expect(1)
        .create_async()
        .await;

    // Must NOT fall back to re-uploading as a new file.
    let upload_mock = server
        .mock("POST", "/api/desktop/v1/files/upload/initiate")
        .expect(0)
        .create_async()
        .await;
    let delete_mock = server
        .mock("POST", "/api/desktop/v1/files/delete")
        .expect(0)
        .create_async()
        .await;

    let (m, _db_dir) = seeded_manifest(&[ManifestEntry {
        remote_id: "file-1".into(),
        entity_type: "file".into(),
        remote_path: "demo.gif".into(),
        local_path: old_path.to_string_lossy().into(),
        remote_version: 1,
        checksum: Some(checksum),
        size: content.len() as i64,
        synced_at: "2026-04-14T00:00:00Z".into(),
    }]);
    let mut engine = new_engine(&server.url(), m, sync_root.path()).await;

    let ops = engine.reconcile_from_disk().await.unwrap();

    rename_mock.assert_async().await;
    upload_mock.assert_async().await;
    delete_mock.assert_async().await;
    assert_eq!(ops, 1, "expected one rename op, not a delete+upload pair");
}

#[tokio::test]
async fn clean_state_synthesizes_nothing() {
    // Manifest and disk agree → reconcile is a no-op.
    let sync_root = tempfile::tempdir().unwrap();
    let path = sync_root.path().join("a.txt");
    std::fs::write(&path, b"same").unwrap();

    let server = mockito::Server::new_async().await;

    let (m, _db_dir) = seeded_manifest(&[ManifestEntry {
        remote_id: "file-1".into(),
        entity_type: "file".into(),
        remote_path: "a.txt".into(),
        local_path: path.to_string_lossy().into(),
        remote_version: 1,
        checksum: Some(sha256_hex(b"same")),
        size: 4,
        synced_at: "2026-04-14T00:00:00Z".into(),
    }]);
    let mut engine = new_engine(&server.url(), m, sync_root.path()).await;

    let ops = engine.reconcile_from_disk().await.unwrap();
    assert_eq!(ops, 0);
}
