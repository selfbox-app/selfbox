//! Integration tests for the mutation journal + startup replay.
//!
//! Scenario: a mutation is journaled before the network call. The network
//! call fails (simulated here as a mockito 5xx). On the next startup,
//! `replay_pending_ops` re-issues the mutation with the same idempotency
//! key and the journal entry is cleared.
//!
//! Run with: `cargo test --test pending_ops`

use selfbox_desktop_sync::api::client::SelfboxClient;
use selfbox_desktop_sync::sync::engine::SyncEngine;
use selfbox_desktop_sync::sync::manifest::{PendingOp, SyncManifest};

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

fn seed_pending(op_kind: &str, endpoint: &str, key: &str) -> PendingOp {
    PendingOp {
        idempotency_key: key.into(),
        op_kind: op_kind.into(),
        endpoint: endpoint.into(),
        payload: format!(
            r#"{{"workspaceId":"ws-1","id":"f-1","name":"renamed.txt","expectedVersion":1,"idempotencyKey":"{key}"}}"#
        ),
        created_at: "2026-04-14T00:00:00Z".into(),
        attempts: 0,
    }
}

#[tokio::test]
async fn replay_clears_journal_on_success() {
    let sync_root = tempfile::tempdir().unwrap();
    let db_dir = tempfile::tempdir().unwrap();
    let manifest = SyncManifest::open(db_dir.path().join("m.db").to_str().unwrap()).unwrap();

    manifest
        .insert_pending_op(&seed_pending("rename_file", "/files/rename", "k-success"))
        .unwrap();

    let mut server = mockito::Server::new_async().await;
    let rename_mock = server
        .mock("POST", "/api/desktop/v1/files/rename")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{"id":"f-1","name":"renamed.txt","version":2}"#)
        .expect(1)
        .create_async()
        .await;

    let mut engine = new_engine(&server.url(), manifest, sync_root.path()).await;
    let n = engine.replay_pending_ops().await.unwrap();
    assert_eq!(n, 1);

    rename_mock.assert_async().await;
    // Journal should now be empty on the engine's connection.
    assert_eq!(engine.pending_op_count().unwrap(), 0);
}

#[tokio::test]
async fn replay_leaves_journal_entry_on_server_failure() {
    let sync_root = tempfile::tempdir().unwrap();
    let db_dir = tempfile::tempdir().unwrap();
    let manifest = SyncManifest::open(db_dir.path().join("m.db").to_str().unwrap()).unwrap();

    manifest
        .insert_pending_op(&seed_pending("rename_file", "/files/rename", "k-fail"))
        .unwrap();

    let mut server = mockito::Server::new_async().await;
    // Always 500 — retry_with_backoff will exhaust its attempts. We don't
    // pin an exact count here because the retry policy may change; what
    // matters is that the journal entry survives the failure below.
    let _rename_mock = server
        .mock("POST", "/api/desktop/v1/files/rename")
        .with_status(500)
        .with_body(r#"{"code":"boom","error":"nope"}"#)
        .expect_at_least(1)
        .create_async()
        .await;

    let mut engine = new_engine(&server.url(), manifest, sync_root.path()).await;
    let _ = engine.replay_pending_ops().await;

    let ops = engine.list_pending_ops_for_test().unwrap();
    assert_eq!(ops.len(), 1, "entry stays so the next restart tries again");
    assert!(ops[0].attempts >= 1, "attempts counter must increment");
}
