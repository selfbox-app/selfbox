import { invoke } from "@tauri-apps/api/core";
import { getState } from "./store";

function serverUrl(): string {
  return getState().serverUrl.replace(/\/+$/, "");
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly data: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Wrap a Rust command that returns `Result<T, String>`. The Err path gives us
 *  a flat string ("Server error 400: invalid_request — ..."), so we surface it
 *  as an ApiError with no structured code/status. */
async function rust<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    return (await invoke(cmd, args)) as T;
  } catch (err) {
    const message = typeof err === "string" ? err : String(err);
    throw new ApiError(message, "rust_error", 0, err);
  }
}

// ── Discovery ───────────────────────────────────────────────────────────

/** Response from /api/desktop/v1/info — identifies whether a given URL
 *  is a Selfbox instance and whether it's the Cloud or self-hosted. */
export interface ServerInfo {
  service: string;
  cloud: boolean;
  name?: string;
}

/** Probe a server URL via the Rust client (consistent with device_* calls
 *  and avoids frontend CORS/CSP concerns). Rejects with ApiError if the
 *  URL isn't reachable or doesn't look like Selfbox. */
export function probeServerInfo(rawServerUrl: string): Promise<ServerInfo> {
  return rust<ServerInfo>("probe_server_info", {
    serverUrl: rawServerUrl.replace(/\/+$/, ""),
  });
}

// ── Device auth ─────────────────────────────────────────────────────────

export interface DeviceTicket {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: string;
  intervalSeconds: number;
}

export interface DeviceTokens {
  status: "approved";
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  deviceId: string;
  userId: string;
}

export function startDeviceFlow(platform: string) {
  return rust<DeviceTicket>("device_start", { serverUrl: serverUrl(), platform });
}

export function exchangeDeviceCode(deviceCode: string) {
  return rust<{ status: "pending" } | DeviceTokens>("device_exchange", {
    serverUrl: serverUrl(),
    deviceCode,
  });
}

export function refreshTokens(refreshToken: string) {
  return rust<DeviceTokens>("device_refresh", {
    serverUrl: serverUrl(),
    refreshToken,
  });
}

export function revokeDevice(token: string) {
  return rust<{ success: boolean }>("device_revoke", {
    serverUrl: serverUrl(),
    accessToken: token,
  });
}

// ── Workspaces ──────────────────────────────────────────────────────────

export interface WorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
}

export async function listWorkspaces(token: string) {
  const workspaces = await rust<WorkspaceSummary[]>("list_workspaces", {
    serverUrl: serverUrl(),
    accessToken: token,
  });
  return { workspaces };
}

// ── Sync ────────────────────────────────────────────────────────────────

export interface BootstrapResult {
  workspace: WorkspaceSummary;
  cursor: number;
  folders: FolderSnapshot[];
  files: FileSnapshot[];
}

export interface FolderSnapshot {
  id: string;
  parentId: string | null;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileSnapshot {
  id: string;
  folderId: string | null;
  name: string;
  mimeType: string;
  size: number;
  checksum: string | null;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyncEvent {
  cursor: number;
  entityType: "file" | "folder";
  entityId: string;
  eventType: "created" | "updated" | "moved" | "renamed" | "deleted";
  payload: unknown;
  createdAt: string;
}

export interface ChangesResult {
  cursor: number;
  hasMore: boolean;
  cursorInvalid: boolean;
  events: SyncEvent[];
}

export function bootstrap(token: string, workspaceId: string) {
  return rust<BootstrapResult>("sync_bootstrap", {
    serverUrl: serverUrl(),
    accessToken: token,
    workspaceId,
  });
}

export function getChanges(token: string, workspaceId: string, cursor: number) {
  return rust<ChangesResult>("sync_changes", {
    serverUrl: serverUrl(),
    accessToken: token,
    workspaceId,
    cursor,
  });
}
