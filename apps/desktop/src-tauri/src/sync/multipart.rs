//! S3-style multipart upload coordinator.
//!
//! The server's `initiate_upload` / `initiate_update` response may return
//! `strategy: "multipart"` when the file is larger than
//! `MULTIPART_THRESHOLD` (10 MiB). In that case the client must:
//!
//! 1. Split the file bytes into chunks of `partSize`
//! 2. PUT each chunk to its presigned URL
//! 3. Capture the `ETag` response header for each part
//! 4. Call the matching `complete_upload` / `complete_update` with the
//!    list of `{ partNumber, etag }` entries and the `uploadId`
//!
//! Parts are uploaded concurrently to MULTIPART_MAX_CONCURRENCY (4) to
//! bound memory and network use without stalling on serial uploads.

use futures::stream::{self, StreamExt};
use serde::Deserialize;
use serde_json::Value;

use crate::api::client::{ApiError, SelfboxClient};

pub const MAX_CONCURRENCY: usize = 4;

#[derive(Debug, Clone, Deserialize)]
pub struct PartUrl {
    #[serde(rename = "partNumber")]
    pub part_number: u32,
    pub url: String,
}

#[derive(Debug, Clone)]
pub struct CompletedPart {
    pub part_number: u32,
    pub etag: String,
}

/// Split `data` into chunks of `part_size` and return owned `Vec<u8>` slices.
/// The last chunk may be smaller than `part_size`.
pub fn split_into_parts(data: &[u8], part_size: usize) -> Vec<Vec<u8>> {
    if part_size == 0 {
        return vec![data.to_vec()];
    }
    data.chunks(part_size).map(|c| c.to_vec()).collect()
}

/// Parse the server's multipart response into `(uploadId, partSize, parts)`.
pub fn parse_multipart_response(
    response: &Value,
) -> Result<(String, usize, Vec<PartUrl>), ApiError> {
    let upload_id = response["uploadId"]
        .as_str()
        .ok_or_else(|| ApiError::Server {
            status: 0,
            code: "missing_upload_id".into(),
            message: "initiate response missing uploadId".into(),
        })?
        .to_string();

    let part_size = response["partSize"].as_u64().unwrap_or(10 * 1024 * 1024) as usize;

    let raw_parts = response["parts"].as_array().ok_or_else(|| ApiError::Server {
        status: 0,
        code: "missing_parts".into(),
        message: "initiate response missing parts[]".into(),
    })?;

    let parts: Vec<PartUrl> = raw_parts
        .iter()
        .map(|p| serde_json::from_value::<PartUrl>(p.clone()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| ApiError::Server {
            status: 0,
            code: "bad_parts".into(),
            message: e.to_string(),
        })?;

    Ok((upload_id, part_size, parts))
}

/// Upload every chunk concurrently (bounded), collect ETags in part order.
/// An error from any individual part aborts the whole upload.
pub async fn upload_all_parts(
    client: &SelfboxClient,
    parts: Vec<PartUrl>,
    chunks: Vec<Vec<u8>>,
    content_type: &str,
) -> Result<Vec<CompletedPart>, ApiError> {
    if parts.len() != chunks.len() {
        return Err(ApiError::Server {
            status: 0,
            code: "part_count_mismatch".into(),
            message: format!(
                "server returned {} presigned URLs but file split into {} chunks",
                parts.len(),
                chunks.len()
            ),
        });
    }

    // Pair each presigned URL with its chunk. Upload them concurrently.
    let pairs: Vec<(PartUrl, Vec<u8>)> = parts.into_iter().zip(chunks).collect();

    let results = stream::iter(pairs)
        .map(|(part, bytes)| async move {
            let etag = client
                .upload_presigned(&part.url, bytes, content_type)
                .await?;
            let etag = etag.ok_or_else(|| ApiError::Server {
                status: 0,
                code: "missing_etag".into(),
                message: format!("part {} missing ETag in response", part.part_number),
            })?;
            Ok::<CompletedPart, ApiError>(CompletedPart {
                part_number: part.part_number,
                etag,
            })
        })
        .buffer_unordered(MAX_CONCURRENCY)
        .collect::<Vec<Result<CompletedPart, ApiError>>>()
        .await;

    // Bubble the first error, otherwise collect.
    let mut completed: Vec<CompletedPart> = Vec::with_capacity(results.len());
    for r in results {
        completed.push(r?);
    }
    // S3 requires parts in ascending partNumber order for complete.
    completed.sort_by_key(|p| p.part_number);
    Ok(completed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_into_parts_handles_exact_multiple() {
        let data = vec![0u8; 30];
        let parts = split_into_parts(&data, 10);
        assert_eq!(parts.len(), 3);
        assert!(parts.iter().all(|p| p.len() == 10));
    }

    #[test]
    fn split_into_parts_pads_last_part_when_smaller() {
        let data = vec![0u8; 25];
        let parts = split_into_parts(&data, 10);
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0].len(), 10);
        assert_eq!(parts[1].len(), 10);
        assert_eq!(parts[2].len(), 5);
    }

    #[test]
    fn split_into_parts_with_single_chunk() {
        let data = vec![1u8, 2, 3];
        let parts = split_into_parts(&data, 10);
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0], vec![1, 2, 3]);
    }

    #[test]
    fn split_into_parts_zero_size_returns_whole_data() {
        let data = vec![1u8, 2, 3];
        let parts = split_into_parts(&data, 0);
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0], vec![1, 2, 3]);
    }

    #[test]
    fn parse_multipart_response_extracts_fields() {
        let v = serde_json::json!({
            "uploadId": "mp-abc",
            "partSize": 10 * 1024 * 1024,
            "parts": [
                { "partNumber": 1, "url": "https://s3/part1" },
                { "partNumber": 2, "url": "https://s3/part2" },
            ]
        });
        let (id, size, parts) = parse_multipart_response(&v).unwrap();
        assert_eq!(id, "mp-abc");
        assert_eq!(size, 10 * 1024 * 1024);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].part_number, 1);
    }

    #[test]
    fn parse_multipart_response_errors_without_upload_id() {
        let v = serde_json::json!({ "parts": [] });
        assert!(parse_multipart_response(&v).is_err());
    }
}
