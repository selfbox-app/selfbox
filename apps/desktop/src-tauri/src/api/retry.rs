//! Retry with jittered exponential backoff for transient API failures.
//!
//! Network blips, 5xx responses, and connection resets are common in real-world
//! sync; a single-attempt model means every such event becomes a user-visible
//! failure. This module wraps *idempotent* API calls so they self-heal.
//!
//! Callers must not wrap non-idempotent operations (new-file `initiate_upload`,
//! rename/move/delete with a consumed `expectedVersion`) — those need
//! server-side idempotency keys before retrying is safe.

use std::future::Future;
use std::time::Duration;

use super::client::ApiError;

/// Default policy: 4 attempts (1 initial + 3 retries), 100 ms base, 2× factor,
/// capped at 10 s, with ±25 % jitter.
pub const DEFAULT_MAX_ATTEMPTS: u32 = 4;
const BASE_DELAY_MS: u64 = 100;
const FACTOR: u64 = 2;
const MAX_DELAY_MS: u64 = 10_000;
const JITTER_PCT: u64 = 25;

impl ApiError {
    /// Is this error worth retrying? True for network/timeout errors and 5xx
    /// server responses; false for 4xx, version conflicts, and checksum
    /// mismatches (those are deterministic and won't change on retry).
    pub fn is_retryable(&self) -> bool {
        match self {
            ApiError::Http(_) => true,
            ApiError::Server { status, .. } => *status >= 500 && *status < 600,
            ApiError::VersionConflict { .. } | ApiError::ChecksumMismatch { .. } => false,
        }
    }
}

/// Run `op` up to `max_attempts` times with jittered exponential backoff.
/// Returns on first success or first non-retryable error. After `max_attempts`
/// retryable failures, returns the last error.
pub async fn retry_with_backoff<F, Fut, T>(
    max_attempts: u32,
    mut op: F,
) -> Result<T, ApiError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, ApiError>>,
{
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        match op().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                if !e.is_retryable() || attempt >= max_attempts {
                    return Err(e);
                }
                let delay = backoff_delay(attempt);
                log::warn!(
                    "API call failed (attempt {}/{}): {}. Retrying in {:?}.",
                    attempt,
                    max_attempts,
                    e,
                    delay
                );
                tokio::time::sleep(delay).await;
            }
        }
    }
}

/// Compute the sleep duration before retry `attempt` (1-indexed: attempt=1
/// means "we just failed once, how long before try 2").
fn backoff_delay(attempt: u32) -> Duration {
    let base = BASE_DELAY_MS.saturating_mul(FACTOR.saturating_pow(attempt - 1));
    let capped = base.min(MAX_DELAY_MS);
    let jitter_range = capped.saturating_mul(JITTER_PCT) / 100;
    let jitter = pseudo_random_jitter(jitter_range);
    // Apply jitter symmetrically around the capped value.
    let total = capped
        .saturating_add(jitter)
        .saturating_sub(jitter_range / 2);
    Duration::from_millis(total)
}

/// Cheap, non-cryptographic jitter source derived from the current nanos.
/// We only need this to spread simultaneous retries from many clients;
/// no need for a real RNG dep.
fn pseudo_random_jitter(range: u64) -> u64 {
    if range == 0 {
        return 0;
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0);
    nanos % range
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;

    fn transient() -> ApiError {
        ApiError::Server {
            status: 503,
            code: "unavailable".into(),
            message: "try again".into(),
        }
    }

    fn terminal() -> ApiError {
        ApiError::VersionConflict {
            entity_id: "abc".into(),
            current_version: 2,
        }
    }

    #[test]
    fn is_retryable_classifies_correctly() {
        assert!(transient().is_retryable(), "5xx should retry");
        assert!(
            ApiError::Http("timeout".into()).is_retryable(),
            "network errors should retry"
        );
        assert!(!terminal().is_retryable(), "version conflict terminal");
        assert!(
            !ApiError::ChecksumMismatch {
                file_id: "x".into(),
                expected: "a".into(),
                actual: "b".into()
            }
            .is_retryable(),
            "checksum mismatch terminal"
        );
        assert!(
            !ApiError::Server {
                status: 404,
                code: "not_found".into(),
                message: "gone".into()
            }
            .is_retryable(),
            "4xx not retryable"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn succeeds_on_first_try() {
        let calls = Arc::new(AtomicU32::new(0));
        let c = calls.clone();
        let out: Result<i32, ApiError> = retry_with_backoff(3, move || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Ok(42)
            }
        })
        .await;
        assert_eq!(out.unwrap(), 42);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn succeeds_after_transient_failures() {
        let calls = Arc::new(AtomicU32::new(0));
        let c = calls.clone();
        let out: Result<&'static str, ApiError> = retry_with_backoff(4, move || {
            let c = c.clone();
            async move {
                let n = c.fetch_add(1, Ordering::SeqCst) + 1;
                if n < 3 {
                    Err(transient())
                } else {
                    Ok("ok")
                }
            }
        })
        .await;
        assert_eq!(out.unwrap(), "ok");
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }

    #[tokio::test(start_paused = true)]
    async fn stops_on_terminal_error() {
        let calls = Arc::new(AtomicU32::new(0));
        let c = calls.clone();
        let out: Result<(), ApiError> = retry_with_backoff(5, move || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err::<(), _>(terminal())
            }
        })
        .await;
        assert!(matches!(out, Err(ApiError::VersionConflict { .. })));
        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "terminal errors must not retry"
        );
    }

    #[tokio::test(start_paused = true)]
    async fn gives_up_after_max_attempts() {
        let calls = Arc::new(AtomicU32::new(0));
        let c = calls.clone();
        let out: Result<(), ApiError> = retry_with_backoff(3, move || {
            let c = c.clone();
            async move {
                c.fetch_add(1, Ordering::SeqCst);
                Err::<(), _>(transient())
            }
        })
        .await;
        assert!(out.is_err());
        assert_eq!(
            calls.load(Ordering::SeqCst),
            3,
            "should attempt exactly max_attempts times"
        );
    }

    #[test]
    fn backoff_delay_grows_then_caps() {
        let d1 = backoff_delay(1).as_millis();
        let d2 = backoff_delay(2).as_millis();
        let d3 = backoff_delay(3).as_millis();
        // Base 100ms ± 25% jitter → roughly 87-112ms on attempt 1
        assert!(d1 >= 87 && d1 <= 125, "attempt 1 was {d1}ms");
        // 200ms ± 25%
        assert!(d2 >= 175 && d2 <= 225, "attempt 2 was {d2}ms");
        // 400ms ± 25%
        assert!(d3 >= 350 && d3 <= 450, "attempt 3 was {d3}ms");

        // Large attempts should cap around MAX_DELAY_MS (within jitter).
        let huge = backoff_delay(30).as_millis();
        let upper = (MAX_DELAY_MS as u128) + (MAX_DELAY_MS as u128) * JITTER_PCT as u128 / 100;
        assert!(huge <= upper, "should cap near 10s, got {huge}");
    }
}
