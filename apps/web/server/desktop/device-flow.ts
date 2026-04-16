import { addDays, addMinutes } from "date-fns";
import { formatUserCode, generateOpaqueToken, generateUserCode, hashOpaqueToken, normalizeUserCode } from "./tokens";

const APPROVAL_WINDOW_MINUTES = 15;
const ACCESS_TOKEN_TTL_DAYS = 1;
const REFRESH_TOKEN_TTL_DAYS = 30;

export interface DesktopDeviceRecord {
  id: string;
  userId: string | null;
  clientName: string | null;
  clientVersion: string | null;
  platform: string;
  userCode: string;
  deviceCodeHash: string;
  accessTokenHash: string | null;
  refreshTokenHash: string | null;
  approvalExpiresAt: Date;
  approvedAt: Date | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DesktopDeviceRepository {
  createPendingDevice(input: {
    clientName?: string;
    clientVersion?: string;
    platform: string;
    userCode: string;
    deviceCodeHash: string;
    approvalExpiresAt: Date;
  }): Promise<DesktopDeviceRecord>;
  findByUserCode(userCode: string): Promise<DesktopDeviceRecord | null>;
  findByDeviceCodeHash(deviceCodeHash: string): Promise<DesktopDeviceRecord | null>;
  findByAccessTokenHash(accessTokenHash: string): Promise<DesktopDeviceRecord | null>;
  findByRefreshTokenHash(refreshTokenHash: string): Promise<DesktopDeviceRecord | null>;
  approveDevice(params: {
    deviceId: string;
    userId: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    approvedAt: Date;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
  }): Promise<DesktopDeviceRecord>;
  rotateDeviceTokens(params: {
    deviceId: string;
    accessTokenHash: string;
    refreshTokenHash: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
  }): Promise<DesktopDeviceRecord>;
  touchDevice(deviceId: string, lastSeenAt: Date): Promise<void>;
  revokeDevice(deviceId: string, revokedAt: Date): Promise<void>;
}

export interface DeviceApprovalTicket {
  deviceCode: string;
  expiresAt: Date;
  intervalSeconds: number;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
}

export interface DeviceTokenBundle {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export class DesktopDeviceFlowError extends Error {
  constructor(
    message: string,
    readonly code:
      | "expired"
      | "invalid_code"
      | "not_approved"
      | "revoked"
      | "already_approved"
      | "invalid_token",
  ) {
    super(message);
    this.name = "DesktopDeviceFlowError";
  }
}

export async function startDesktopDeviceFlow(
  repo: DesktopDeviceRepository,
  input: {
    baseUrl: string;
    clientName?: string;
    clientVersion?: string;
    platform: string;
    now?: Date;
  },
): Promise<DeviceApprovalTicket> {
  const now = input.now ?? new Date();
  const deviceCode = generateOpaqueToken(32);
  const userCode = generateUserCode();
  const expiresAt = addMinutes(now, APPROVAL_WINDOW_MINUTES);

  await repo.createPendingDevice({
    clientName: input.clientName,
    clientVersion: input.clientVersion,
    platform: input.platform,
    userCode,
    deviceCodeHash: hashOpaqueToken(deviceCode),
    approvalExpiresAt: expiresAt,
  });

  const verificationUri = new URL("/desktop/authorize", input.baseUrl);
  verificationUri.searchParams.set("user_code", userCode);

  return {
    deviceCode,
    expiresAt,
    intervalSeconds: 5,
    userCode,
    verificationUri: verificationUri.origin + verificationUri.pathname,
    verificationUriComplete: verificationUri.toString(),
  };
}

export async function approveDesktopDeviceFlow(
  repo: DesktopDeviceRepository,
  input: {
    userCode: string;
    userId: string;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const device = await repo.findByUserCode(formatUserCode(input.userCode));

  if (!device) {
    throw new DesktopDeviceFlowError("Unknown device approval code", "invalid_code");
  }
  if (device.revokedAt) {
    throw new DesktopDeviceFlowError("This device authorization has been revoked", "revoked");
  }
  if (device.approvedAt) {
    throw new DesktopDeviceFlowError("This device has already been approved", "already_approved");
  }
  if (device.approvalExpiresAt <= now) {
    throw new DesktopDeviceFlowError("This device approval code has expired", "expired");
  }

  const tokenBundle = createDeviceTokenBundle(now);
  await repo.approveDevice({
    deviceId: device.id,
    userId: input.userId,
    accessTokenHash: hashOpaqueToken(tokenBundle.accessToken),
    refreshTokenHash: hashOpaqueToken(tokenBundle.refreshToken),
    approvedAt: now,
    accessTokenExpiresAt: tokenBundle.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokenBundle.refreshTokenExpiresAt,
  });
}

export async function exchangeDesktopDeviceFlow(
  repo: DesktopDeviceRepository,
  input: {
    deviceCode: string;
    now?: Date;
  },
): Promise<
  | { status: "pending" }
  | ({ status: "approved" } & DeviceTokenBundle & { deviceId: string; userId: string })
> {
  const now = input.now ?? new Date();
  const device = await repo.findByDeviceCodeHash(hashOpaqueToken(input.deviceCode));

  if (!device) {
    throw new DesktopDeviceFlowError("Unknown device code", "invalid_code");
  }
  if (device.revokedAt) {
    throw new DesktopDeviceFlowError("This device authorization has been revoked", "revoked");
  }
  if (device.approvalExpiresAt <= now && !device.approvedAt) {
    throw new DesktopDeviceFlowError("This device approval code has expired", "expired");
  }
  if (!device.approvedAt || !device.userId || !device.accessTokenHash || !device.refreshTokenHash) {
    return { status: "pending" };
  }

  const tokenBundle = createDeviceTokenBundle(now);
  const rotated = await repo.rotateDeviceTokens({
    deviceId: device.id,
    accessTokenHash: hashOpaqueToken(tokenBundle.accessToken),
    refreshTokenHash: hashOpaqueToken(tokenBundle.refreshToken),
    accessTokenExpiresAt: tokenBundle.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokenBundle.refreshTokenExpiresAt,
  });

  return {
    status: "approved",
    deviceId: rotated.id,
    userId: rotated.userId!,
    ...tokenBundle,
  };
}

export async function refreshDesktopDeviceFlow(
  repo: DesktopDeviceRepository,
  input: {
    refreshToken: string;
    now?: Date;
  },
): Promise<DeviceTokenBundle & { deviceId: string; userId: string }> {
  const now = input.now ?? new Date();
  const device = await repo.findByRefreshTokenHash(hashOpaqueToken(input.refreshToken));

  if (!device || !device.userId) {
    throw new DesktopDeviceFlowError("Unknown refresh token", "invalid_token");
  }
  if (device.revokedAt) {
    throw new DesktopDeviceFlowError("This device authorization has been revoked", "revoked");
  }
  if (!device.refreshTokenExpiresAt || device.refreshTokenExpiresAt <= now) {
    throw new DesktopDeviceFlowError("This refresh token has expired", "expired");
  }

  const tokenBundle = createDeviceTokenBundle(now);
  const rotated = await repo.rotateDeviceTokens({
    deviceId: device.id,
    accessTokenHash: hashOpaqueToken(tokenBundle.accessToken),
    refreshTokenHash: hashOpaqueToken(tokenBundle.refreshToken),
    accessTokenExpiresAt: tokenBundle.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokenBundle.refreshTokenExpiresAt,
  });

  return {
    deviceId: rotated.id,
    userId: rotated.userId!,
    ...tokenBundle,
  };
}

export async function authenticateDesktopAccessToken(
  repo: DesktopDeviceRepository,
  accessToken: string,
  now = new Date(),
): Promise<DesktopDeviceRecord> {
  const device = await repo.findByAccessTokenHash(hashOpaqueToken(accessToken));

  if (!device || !device.userId) {
    throw new DesktopDeviceFlowError("Unknown access token", "invalid_token");
  }
  if (device.revokedAt) {
    throw new DesktopDeviceFlowError("This device authorization has been revoked", "revoked");
  }
  if (!device.accessTokenExpiresAt || device.accessTokenExpiresAt <= now) {
    throw new DesktopDeviceFlowError("This access token has expired", "expired");
  }

  await repo.touchDevice(device.id, now);
  return device;
}

export async function revokeDesktopDeviceFlow(
  repo: DesktopDeviceRepository,
  token: string,
  now = new Date(),
): Promise<void> {
  const tokenHash = hashOpaqueToken(token);
  const device =
    (await repo.findByAccessTokenHash(tokenHash)) ??
    (await repo.findByRefreshTokenHash(tokenHash));

  if (!device) {
    throw new DesktopDeviceFlowError("Unknown device token", "invalid_token");
  }

  await repo.revokeDevice(device.id, now);
}

function createDeviceTokenBundle(now: Date): DeviceTokenBundle {
  return {
    accessToken: generateOpaqueToken(32),
    refreshToken: generateOpaqueToken(32),
    accessTokenExpiresAt: addDays(now, ACCESS_TOKEN_TTL_DAYS),
    refreshTokenExpiresAt: addDays(now, REFRESH_TOKEN_TTL_DAYS),
  };
}
