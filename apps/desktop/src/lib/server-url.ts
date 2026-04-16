// Pre-flight check on a user-entered server URL before we hit the
// network. This is layer one of the defense; layer two is the
// `/api/desktop/v1/info` probe that follows.
//
// Rules:
//   - Must parse as a URL with a hostname.
//   - Protocol must be https:, except for localhost / *.localhost /
//     loopback where we allow http: to let self-hosters develop
//     locally without setting up TLS.
//   - Trailing slashes are stripped so the caller can compose paths
//     without worrying about double slashes.

import { SELFBOX_CLOUD_URL } from "./config";

export type ValidateResult =
  | { ok: true; url: URL }
  | { ok: false; error: string };

export function validateServerUrl(input: string): ValidateResult {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return { ok: false, error: "Enter a server URL" };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL" };
  }

  if (!url.hostname) {
    return { ok: false, error: "URL is missing a hostname" };
  }

  const host = url.hostname.toLowerCase();
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".localhost");

  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    return { ok: false, error: "Server URL must start with https://" };
  }

  return { ok: true, url };
}

/** True if `url` is the Cloud URL, regardless of trailing slash. */
export function isCloudUrl(url: string): boolean {
  return url.replace(/\/+$/, "") === SELFBOX_CLOUD_URL;
}
