use reqwest::{Client, StatusCode};
use serde_json::Value;
use std::error::Error as StdError;
use super::retry::{retry_with_backoff, DEFAULT_MAX_ATTEMPTS};
use super::types::*;

/// Attach the idempotency key (if any) to a mutation body. Kept as a free
/// helper so each method stays focused on shaping its own payload.
fn build_body(mut base: Value, idempotency_key: Option<&str>) -> Value {
    if let Some(key) = idempotency_key {
        if let Some(obj) = base.as_object_mut() {
            obj.insert(
                "idempotencyKey".into(),
                Value::String(key.to_string()),
            );
        }
    }
    base
}

pub struct SelfboxClient {
    client: Client,
    base_url: String,
    access_token: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Version conflict on {entity_id} (current version: {current_version})")]
    VersionConflict {
        entity_id: String,
        current_version: i64,
    },

    #[error("Checksum mismatch for file {file_id}")]
    ChecksumMismatch {
        file_id: String,
        expected: String,
        actual: String,
    },

    #[error("Server error {status}: {code} — {message}")]
    Server {
        status: u16,
        code: String,
        message: String,
    },
}

impl From<reqwest::Error> for ApiError {
    fn from(err: reqwest::Error) -> Self {
        // reqwest::Error's Display is often unhelpful ("builder error", "error
        // sending request") — walk the source chain so the actual cause
        // (bad URL, invalid header byte, DNS failure, etc.) reaches the UI.
        let mut msg = err.to_string();
        if let Some(url) = err.url() {
            msg.push_str(&format!(" (url: {url})"));
        }
        let mut src: Option<&(dyn StdError + 'static)> = err.source();
        while let Some(s) = src {
            msg.push_str(" → ");
            msg.push_str(&s.to_string());
            src = s.source();
        }
        ApiError::Http(msg)
    }
}

impl SelfboxClient {
    pub fn new(base_url: &str) -> Self {
        // Conservative timeouts that still accommodate real-world sync
        // workloads. `timeout` applies per request; downloads and stream
        // uploads can take longer and override via request-level config if
        // needed.
        let client = Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(120))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            access_token: None,
        }
    }

    pub fn set_token(&mut self, token: String) {
        self.access_token = Some(token);
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}/api/desktop/v1{}", self.base_url, path)
    }

    /// Resolve a URL that may be absolute (`https://...`) or a server-relative
    /// path (`/api/files/serve/...`) against this client's `base_url`.
    /// Local-storage backends return relative URLs from `getSignedUrl` because
    /// they're meant to be consumed by a browser that already knows the origin.
    /// The desktop client needs an absolute URL to hand to `reqwest`.
    fn resolve_url(&self, url: &str) -> String {
        if url.starts_with("http://") || url.starts_with("https://") {
            url.to_string()
        } else if let Some(stripped) = url.strip_prefix('/') {
            format!("{}/{}", self.base_url, stripped)
        } else {
            format!("{}/{}", self.base_url, url)
        }
    }

    fn bearer(&self) -> &str {
        self.access_token.as_deref().unwrap_or("")
    }

    /// Unpack the server response, converting error codes into typed ApiError variants.
    async fn parse<T: serde::de::DeserializeOwned>(
        &self,
        resp: reqwest::Response,
    ) -> Result<T, ApiError> {
        let status = resp.status();
        if status.is_success() {
            return Ok(resp.json::<T>().await?);
        }

        let body: Value = resp.json().await.unwrap_or(Value::Null);
        let code = body["code"].as_str().unwrap_or("unknown").to_string();
        let message = body["error"].as_str().unwrap_or("").to_string();

        match (status, code.as_str()) {
            (StatusCode::CONFLICT, "version_conflict") => {
                Err(ApiError::VersionConflict {
                    entity_id: body["entityId"].as_str().unwrap_or("").into(),
                    current_version: body["currentVersion"].as_i64().unwrap_or(0),
                })
            }
            (StatusCode::UNPROCESSABLE_ENTITY, "checksum_mismatch") => {
                Err(ApiError::ChecksumMismatch {
                    file_id: body["fileId"].as_str().unwrap_or("").into(),
                    expected: body["expected"].as_str().unwrap_or("").into(),
                    actual: body["actual"].as_str().unwrap_or("").into(),
                })
            }
            _ => Err(ApiError::Server {
                status: status.as_u16(),
                code,
                message,
            }),
        }
    }

    // ── Discovery ───────────────────────────────────────────────────────

    /// Probe the server's public info endpoint. Used by sign-in to verify
    /// a user-entered URL actually points at a Selfbox instance before we
    /// open a browser auth window. Short timeout (5s) because the user is
    /// blocked on this response and a stuck probe is worse than a retry.
    pub async fn server_info(&self) -> Result<ServerInfo, ApiError> {
        let resp = self
            .client
            .get(self.api_url("/info"))
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await?;
        self.parse(resp).await
    }

    // ── Device auth ─────────────────────────────────────────────────────

    pub async fn start_device_flow(&self, platform: &str) -> Result<DeviceTicket, ApiError> {
        let resp = self
            .client
            .post(self.api_url("/device/start"))
            .json(&serde_json::json!({
                "platform": platform,
                "clientName": "Selfbox Desktop Sync",
                "clientVersion": "0.1.0"
            }))
            .send()
            .await?;
        self.parse(resp).await
    }

    pub async fn exchange_device_code(&self, device_code: &str) -> Result<Value, ApiError> {
        let resp = self
            .client
            .post(self.api_url("/device/exchange"))
            .json(&serde_json::json!({ "deviceCode": device_code }))
            .send()
            .await?;
        self.parse(resp).await
    }

    pub async fn refresh_tokens(&self, refresh_token: &str) -> Result<Value, ApiError> {
        let resp = self
            .client
            .post(self.api_url("/device/refresh"))
            .json(&serde_json::json!({ "refreshToken": refresh_token }))
            .send()
            .await?;
        self.parse(resp).await
    }

    pub async fn revoke_device(&self, token: &str) -> Result<Value, ApiError> {
        let resp = self
            .client
            .post(self.api_url("/device/revoke"))
            .bearer_auth(token)
            .json(&serde_json::json!({}))
            .send()
            .await?;
        self.parse(resp).await
    }

    // ── Workspaces & sync ───────────────────────────────────────────────

    pub async fn list_workspaces(&self) -> Result<Vec<WorkspaceSummary>, ApiError> {
        #[derive(serde::Deserialize)]
        struct Res { workspaces: Vec<WorkspaceSummary> }

        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .get(self.api_url("/workspaces"))
                .bearer_auth(self.bearer())
                .send()
                .await?;
            let res: Res = self.parse(resp).await?;
            Ok(res.workspaces)
        })
        .await
    }

    pub async fn bootstrap(&self, workspace_id: &str) -> Result<BootstrapResult, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/sync/bootstrap"))
                .bearer_auth(self.bearer())
                .json(&serde_json::json!({ "workspaceId": workspace_id }))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn get_changes(
        &self,
        workspace_id: &str,
        cursor: i64,
    ) -> Result<ChangesResult, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .get(self.api_url(&format!(
                    "/sync/changes?workspaceId={}&cursor={}",
                    workspace_id, cursor
                )))
                .bearer_auth(self.bearer())
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    // ── File ops ────────────────────────────────────────────────────────

    /// Fetch the current server-side snapshot for a single file. Used after a
    /// version_conflict to re-sync authoritative state without waiting for
    /// the change feed.
    pub async fn get_file(
        &self,
        workspace_id: &str,
        file_id: &str,
    ) -> Result<FileSnapshot, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/files/get"))
                .bearer_auth(self.bearer())
                .json(&serde_json::json!({
                    "workspaceId": workspace_id,
                    "fileId": file_id,
                }))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn get_download_url(
        &self,
        workspace_id: &str,
        file_id: &str,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/files/download-url"))
                .bearer_auth(self.bearer())
                .json(&serde_json::json!({
                    "workspaceId": workspace_id,
                    "fileId": file_id
                }))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    /// Initiate an upload. Returns { fileId, storagePath, strategy, presignedUrl?, ... }
    pub async fn initiate_upload(
        &self,
        workspace_id: &str,
        file_name: &str,
        file_size: i64,
        content_type: &str,
        folder_id: Option<&str>,
        checksum: &str,
    ) -> Result<Value, ApiError> {
        let resp = self
            .client
            .post(self.api_url("/files/upload/initiate"))
            .bearer_auth(self.bearer())
            .json(&serde_json::json!({
                "workspaceId": workspace_id,
                "fileName": file_name,
                "fileSize": file_size,
                "contentType": content_type,
                "folderId": folder_id,
                "checksum": checksum,
            }))
            .send()
            .await?;
        self.parse(resp).await
    }

    /// Initiate a content update on an existing file. Returns the same
    /// shape as initiate_upload, plus the server-issued fileId (unchanged).
    pub async fn initiate_update(
        &self,
        workspace_id: &str,
        file_id: &str,
        file_size: i64,
        content_type: &str,
        checksum: &str,
        expected_version: i64,
    ) -> Result<Value, ApiError> {
        let resp = self
            .client
            .post(self.api_url("/files/update/initiate"))
            .bearer_auth(self.bearer())
            .json(&serde_json::json!({
                "workspaceId": workspace_id,
                "fileId": file_id,
                "fileSize": file_size,
                "contentType": content_type,
                "checksum": checksum,
                "expectedVersion": expected_version,
            }))
            .send()
            .await?;
        self.parse(resp).await
    }

    /// Complete a content update. Pass the pendingPath returned by initiate.
    pub async fn complete_update(
        &self,
        workspace_id: &str,
        file_id: &str,
        pending_path: &str,
        upload_id: Option<&str>,
        parts: Option<&Value>,
    ) -> Result<Value, ApiError> {
        let mut body = serde_json::json!({
            "workspaceId": workspace_id,
            "fileId": file_id,
            "pendingPath": pending_path,
        });
        if let Some(uid) = upload_id {
            body["uploadId"] = Value::String(uid.into());
        }
        if let Some(p) = parts {
            body["parts"] = p.clone();
        }

        let resp = self
            .client
            .post(self.api_url("/files/update/complete"))
            .bearer_auth(self.bearer())
            .json(&body)
            .send()
            .await?;
        self.parse(resp).await
    }

    pub async fn complete_upload(
        &self,
        workspace_id: &str,
        file_id: &str,
        upload_id: Option<&str>,
        parts: Option<&Value>,
    ) -> Result<Value, ApiError> {
        let mut body = serde_json::json!({
            "workspaceId": workspace_id,
            "fileId": file_id,
        });
        if let Some(uid) = upload_id {
            body["uploadId"] = Value::String(uid.into());
        }
        if let Some(p) = parts {
            body["parts"] = p.clone();
        }

        let resp = self
            .client
            .post(self.api_url("/files/upload/complete"))
            .bearer_auth(self.bearer())
            .json(&body)
            .send()
            .await?;
        self.parse(resp).await
    }

    /// Rename a file on the server. `idempotency_key`, when provided, makes
    /// the call retry-safe: the server caches the response against the key
    /// and returns it verbatim on subsequent calls with the same key. All
    /// mutation methods below share the same contract — callers that
    /// journal the op should always pass a key.
    pub async fn rename_file(
        &self,
        workspace_id: &str,
        id: &str,
        name: &str,
        expected_version: i64,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/files/rename"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "id": id,
                        "name": name,
                        "expectedVersion": expected_version,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn move_file(
        &self,
        workspace_id: &str,
        id: &str,
        target_folder_id: Option<&str>,
        expected_version: i64,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/files/move"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "id": id,
                        "targetFolderId": target_folder_id,
                        "expectedVersion": expected_version,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn delete_file(
        &self,
        workspace_id: &str,
        id: &str,
        expected_version: i64,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/files/delete"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "id": id,
                        "expectedVersion": expected_version,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    // ── Folder ops ──────────────────────────────────────────────────────

    pub async fn create_folder(
        &self,
        workspace_id: &str,
        name: &str,
        parent_id: Option<&str>,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/folders/create"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "name": name,
                        "parentId": parent_id,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn rename_folder(
        &self,
        workspace_id: &str,
        id: &str,
        name: &str,
        expected_version: i64,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/folders/rename"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "id": id,
                        "name": name,
                        "expectedVersion": expected_version,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn move_folder(
        &self,
        workspace_id: &str,
        id: &str,
        target_folder_id: Option<&str>,
        expected_version: i64,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/folders/move"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "id": id,
                        "targetFolderId": target_folder_id,
                        "expectedVersion": expected_version,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    pub async fn delete_folder(
        &self,
        workspace_id: &str,
        id: &str,
        expected_version: i64,
        idempotency_key: Option<&str>,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url("/folders/delete"))
                .bearer_auth(self.bearer())
                .json(&build_body(
                    serde_json::json!({
                        "workspaceId": workspace_id,
                        "id": id,
                        "expectedVersion": expected_version,
                    }),
                    idempotency_key,
                ))
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    /// Replay a previously-journaled mutation. The payload already contains
    /// an `idempotencyKey`, so the server will short-circuit with the cached
    /// response if the mutation already applied before the crash.
    pub async fn replay_mutation(
        &self,
        endpoint: &str,
        payload: &Value,
    ) -> Result<Value, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .post(self.api_url(endpoint))
                .bearer_auth(self.bearer())
                .json(payload)
                .send()
                .await?;
            self.parse(resp).await
        })
        .await
    }

    // ── Raw download via signed URL ─────────────────────────────────────

    pub async fn download_bytes(&self, url: &str) -> Result<bytes::Bytes, ApiError> {
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .get(self.resolve_url(url))
                .timeout(std::time::Duration::from_secs(600))
                .send()
                .await?;
            let status = resp.status();
            if !status.is_success() {
                return Err(ApiError::Server {
                    status: status.as_u16(),
                    code: "download_failed".into(),
                    message: resp.text().await.unwrap_or_default(),
                });
            }
            Ok(resp.bytes().await?)
        })
        .await
    }

    /// Upload bytes to a presigned URL using HTTP PUT (single-shot).
    /// Returns the ETag from the response (used by multipart to assemble
    /// parts on complete). Retries on transient errors — S3/R2 treat PUTs
    /// to the same presigned URL as idempotent (the part is overwritten),
    /// so it's always safe.
    pub async fn upload_presigned(
        &self,
        url: &str,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> Result<Option<String>, ApiError> {
        let bytes = std::sync::Arc::new(bytes);
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let resp = self
                .client
                .put(self.resolve_url(url))
                .header("Content-Type", content_type)
                .timeout(std::time::Duration::from_secs(600))
                .body((*bytes).clone())
                .send()
                .await?;

            let status = resp.status();
            let etag = resp
                .headers()
                .get("etag")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim_matches('"').to_string());

            if !status.is_success() {
                return Err(ApiError::Server {
                    status: status.as_u16(),
                    code: "upload_failed".into(),
                    message: resp.text().await.unwrap_or_default(),
                });
            }
            Ok(etag)
        })
        .await
    }

    /// Server-buffered upload. Used when the storage backend doesn't
    /// support presigned URLs (local disk).
    ///
    /// `storage_path` is required for content updates (the pending sidecar
    /// path returned by `/files/update/initiate`) and ignored for fresh
    /// uploads — the server resolves fresh-upload destinations from the
    /// file row, since user-supplied filenames may contain non-ASCII bytes
    /// that get mangled in HTTP header values.
    pub async fn stream_upload(
        &self,
        workspace_id: &str,
        file_id: &str,
        storage_path: Option<&str>,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> Result<(), ApiError> {
        // Server overwrites the storage path each time, so retrying is
        // idempotent — the file row stays in status=uploading/updating
        // until the matching /complete call flips it.
        let bytes = std::sync::Arc::new(bytes);
        retry_with_backoff(DEFAULT_MAX_ATTEMPTS, || async {
            let mut req = self
                .client
                .put(self.api_url("/files/upload/stream"))
                .bearer_auth(self.bearer())
                .header("Content-Type", content_type)
                .header("x-workspace-id", workspace_id)
                .header("x-file-id", file_id)
                .header("Content-Length", bytes.len().to_string())
                .timeout(std::time::Duration::from_secs(600))
                .body((*bytes).clone());
            if let Some(path) = storage_path {
                req = req.header("x-storage-path", path);
            }
            let resp = req.send().await?;

            let status = resp.status();
            if !status.is_success() {
                let body: Value = resp.json().await.unwrap_or(Value::Null);
                let code = body["code"]
                    .as_str()
                    .unwrap_or("stream_upload_failed")
                    .to_string();
                let message = body["error"].as_str().unwrap_or("").to_string();
                return Err(ApiError::Server {
                    status: status.as_u16(),
                    code,
                    message,
                });
            }
            Ok(())
        })
        .await
    }
}
