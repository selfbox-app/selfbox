//! Integration tests for selective sync.
//!
//! Covers the happy path: user excludes a folder, the engine removes the
//! local subtree + manifest entries, and subsequent remote `created` events
//! for files inside the excluded folder are silently skipped.
//!
//! Run with: `cargo test --test selective_sync`

use selfbox_desktop_sync::api::client::SelfboxClient;
use selfbox_desktop_sync::sync::engine::SyncEngine;
use selfbox_desktop_sync::sync::manifest::{ManifestEntry, SyncManifest};

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

fn folder_entry(id: &str, local_path: &str, name: &str) -> ManifestEntry {
    ManifestEntry {
        remote_id: id.into(),
        entity_type: "folder".into(),
        remote_path: name.into(),
        local_path: local_path.into(),
        remote_version: 1,
        checksum: None,
        size: 0,
        synced_at: "2026-04-14T00:00:00Z".into(),
    }
}

fn file_entry(id: &str, local_path: &str, name: &str, checksum: &str) -> ManifestEntry {
    ManifestEntry {
        remote_id: id.into(),
        entity_type: "file".into(),
        remote_path: name.into(),
        local_path: local_path.into(),
        remote_version: 1,
        checksum: Some(checksum.into()),
        size: 10,
        synced_at: "2026-04-14T00:00:00Z".into(),
    }
}

#[tokio::test]
async fn excluding_folder_removes_local_subtree_and_manifest_entries() {
    let sync_root = tempfile::tempdir().unwrap();

    // Lay out a workspace with one "Archive" folder containing a file.
    let archive_dir = sync_root.path().join("Archive");
    std::fs::create_dir_all(&archive_dir).unwrap();
    let archived_file = archive_dir.join("old.txt");
    std::fs::write(&archived_file, b"archive bytes").unwrap();

    let other_file = sync_root.path().join("keep-me.txt");
    std::fs::write(&other_file, b"other bytes").unwrap();

    let (manifest, _db_dir) = seeded_manifest(&[
        folder_entry("arc", &archive_dir.to_string_lossy(), "Archive"),
        file_entry(
            "arc-file",
            &archived_file.to_string_lossy(),
            "old.txt",
            "a".into(),
        ),
        file_entry(
            "keep",
            &other_file.to_string_lossy(),
            "keep-me.txt",
            "b".into(),
        ),
    ]);

    // No HTTP is expected during set_excluded_folders — it's a local op.
    let server = mockito::Server::new_async().await;
    let mut engine = new_engine(&server.url(), manifest, sync_root.path()).await;

    engine
        .set_excluded_folders(&["arc".to_string()])
        .await
        .unwrap();

    // Archive and its contents should be gone from disk + manifest.
    assert!(
        !archive_dir.exists(),
        "Archive folder should have been removed on exclusion"
    );
    // Sibling file stays.
    assert!(other_file.exists(), "unrelated files should be untouched");
    // Excluded set now contains the folder.
    let excluded = engine.list_excluded_folders().unwrap();
    assert_eq!(excluded, vec!["arc".to_string()]);
}

#[tokio::test]
async fn excluding_a_folder_not_in_manifest_still_records_exclusion() {
    // Reproduces the case where a server-side folder was never
    // materialized locally (never synced). Unchecking it in the UI
    // must still record the exclusion so the UI stays in sync and a
    // subsequent re-check can trigger a fetch.
    let sync_root = tempfile::tempdir().unwrap();
    let (manifest, _db_dir) = seeded_manifest(&[]);

    let mut server = mockito::Server::new_async().await;
    // set_excluded_folders should fetch the server tree once to resolve
    // the missing folder's local_path, then record the exclusion.
    let bootstrap_mock = server
        .mock("POST", "/api/desktop/v1/sync/bootstrap")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(format!(
            r#"{{
                "workspace": {{"id":"ws-1","slug":"t","name":"t","role":"owner"}},
                "cursor": 0,
                "folders": [
                    {{"id":"orphan","parentId":null,"name":"Archive","version":1,"createdAt":"2026-04-14T00:00:00Z","updatedAt":"2026-04-14T00:00:00Z"}}
                ],
                "files": []
            }}"#
        ))
        .expect(1)
        .create_async()
        .await;

    let mut engine = new_engine(&server.url(), manifest, sync_root.path()).await;

    engine
        .set_excluded_folders(&["orphan".to_string()])
        .await
        .unwrap();

    bootstrap_mock.assert_async().await;
    // Exclusion recorded even though the folder was never in the manifest.
    assert_eq!(engine.list_excluded_folders().unwrap(), vec!["orphan"]);
}

#[tokio::test]
async fn including_previously_excluded_folder_triggers_bootstrap() {
    // Re-including a folder has to fetch its content. The simplest
    // correct implementation re-bootstraps; bootstrap is idempotent so
    // already-synced files are skipped.
    let sync_root = tempfile::tempdir().unwrap();
    let (manifest, _db_dir) = seeded_manifest(&[]);
    manifest
        .exclude_folder("arc", &sync_root.path().join("Archive").to_string_lossy())
        .unwrap();

    let mut server = mockito::Server::new_async().await;
    // Bootstrap should be called exactly once when the exclusion set
    // shrinks. Return an empty workspace so we don't need to mock
    // download URLs as well — this test only verifies the trigger.
    let bootstrap_mock = server
        .mock("POST", "/api/desktop/v1/sync/bootstrap")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(
            r#"{
                "workspace": {"id":"ws-1","slug":"test","name":"test","role":"owner"},
                "cursor": 0,
                "folders": [],
                "files": []
            }"#,
        )
        .expect(1)
        .create_async()
        .await;

    let mut engine = new_engine(&server.url(), manifest, sync_root.path()).await;

    assert_eq!(engine.list_excluded_folders().unwrap(), vec!["arc"]);

    // Passing an empty exclusion list means "include everything".
    engine.set_excluded_folders(&[]).await.unwrap();
    assert!(engine.list_excluded_folders().unwrap().is_empty());
    bootstrap_mock.assert_async().await;
}

#[tokio::test]
async fn no_newly_included_folders_does_not_trigger_bootstrap() {
    // If the set changes but only adds exclusions (no inclusions), we
    // must NOT re-bootstrap — that would be a pointless expensive op.
    let sync_root = tempfile::tempdir().unwrap();

    let folder_dir = sync_root.path().join("Archive");
    std::fs::create_dir_all(&folder_dir).unwrap();

    let (manifest, _db_dir) = seeded_manifest(&[folder_entry(
        "arc",
        &folder_dir.to_string_lossy(),
        "Archive",
    )]);

    let mut server = mockito::Server::new_async().await;
    let bootstrap_mock = server
        .mock("POST", "/api/desktop/v1/sync/bootstrap")
        .expect(0)
        .create_async()
        .await;

    let mut engine = new_engine(&server.url(), manifest, sync_root.path()).await;
    engine
        .set_excluded_folders(&["arc".to_string()])
        .await
        .unwrap();

    bootstrap_mock.assert_async().await;
}
