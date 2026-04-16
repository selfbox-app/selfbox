use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTicket {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_at: String,
    pub interval_seconds: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub access_token_expires_at: String,
    pub refresh_token_expires_at: String,
    pub device_id: String,
    pub user_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSnapshot {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSnapshot {
    pub id: String,
    pub folder_id: Option<String>,
    pub name: String,
    pub mime_type: String,
    pub size: i64,
    pub checksum: Option<String>,
    pub status: String,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResult {
    pub workspace: WorkspaceSummary,
    pub cursor: i64,
    pub folders: Vec<FolderSnapshot>,
    pub files: Vec<FileSnapshot>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEvent {
    pub cursor: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    /// The device that caused this event. Used by the engine to skip
    /// events that originated from this client (echo suppression).
    pub actor_device_id: Option<String>,
    pub created_at: String,
}

/// Response shape of the `/api/desktop/v1/info` discovery endpoint.
/// Used by the sign-in flow to verify a user-entered URL points at a
/// real Selfbox instance and to distinguish Cloud from self-hosted.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub service: String,
    pub cloud: bool,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangesResult {
    pub cursor: i64,
    pub has_more: bool,
    pub cursor_invalid: bool,
    pub events: Vec<SyncEvent>,
}
