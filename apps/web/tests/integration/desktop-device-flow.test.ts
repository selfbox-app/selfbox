import { addMinutes } from "date-fns";
import { describe, expect, it } from "vitest";
import type { DesktopDeviceRecord, DesktopDeviceRepository } from "@/server/desktop/device-flow";
import {
  approveDesktopDeviceFlow,
  authenticateDesktopAccessToken,
  exchangeDesktopDeviceFlow,
  refreshDesktopDeviceFlow,
  revokeDesktopDeviceFlow,
  startDesktopDeviceFlow,
} from "@/server/desktop/device-flow";

describe("desktop device flow", () => {
  it("supports start, approve, exchange, refresh, authenticate, and revoke", async () => {
    const repo = createInMemoryDeviceRepository();
    const now = new Date("2026-04-11T00:00:00.000Z");

    const started = await startDesktopDeviceFlow(repo, {
      baseUrl: "https://selfbox.test",
      platform: "macos",
      clientName: "Selfbox Desktop Sync",
      clientVersion: "0.1.0",
      now,
    });

    expect(started.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    await approveDesktopDeviceFlow(repo, {
      userCode: started.userCode,
      userId: "user-1",
      now: addMinutes(now, 1),
    });

    const exchanged = await exchangeDesktopDeviceFlow(repo, {
      deviceCode: started.deviceCode,
      now: addMinutes(now, 1),
    });

    expect(exchanged.status).toBe("approved");
    if (exchanged.status !== "approved") {
      throw new Error("Expected approved device flow");
    }

    const authenticated = await authenticateDesktopAccessToken(
      repo,
      exchanged.accessToken,
      addMinutes(now, 2),
    );
    expect(authenticated.userId).toBe("user-1");

    const refreshed = await refreshDesktopDeviceFlow(repo, {
      refreshToken: exchanged.refreshToken,
      now: addMinutes(now, 3),
    });
    expect(refreshed.deviceId).toBe(exchanged.deviceId);

    await revokeDesktopDeviceFlow(repo, refreshed.refreshToken, addMinutes(now, 4));

    await expect(
      authenticateDesktopAccessToken(repo, refreshed.accessToken, addMinutes(now, 5)),
    ).rejects.toThrow("Unknown access token");
  });
});

function createInMemoryDeviceRepository(): DesktopDeviceRepository {
  const devices: DesktopDeviceRecord[] = [];

  return {
    async createPendingDevice(input) {
      const device: DesktopDeviceRecord = {
        id: `device-${devices.length + 1}`,
        userId: null,
        clientName: input.clientName ?? null,
        clientVersion: input.clientVersion ?? null,
        platform: input.platform,
        userCode: input.userCode,
        deviceCodeHash: input.deviceCodeHash,
        accessTokenHash: null,
        refreshTokenHash: null,
        approvalExpiresAt: input.approvalExpiresAt,
        approvedAt: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        lastSeenAt: null,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      devices.push(device);
      return device;
    },
    async findByUserCode(userCode) {
      return devices.find((device) => device.userCode === userCode) ?? null;
    },
    async findByDeviceCodeHash(deviceCodeHash) {
      return devices.find((device) => device.deviceCodeHash === deviceCodeHash) ?? null;
    },
    async findByAccessTokenHash(accessTokenHash) {
      return devices.find((device) => device.accessTokenHash === accessTokenHash) ?? null;
    },
    async findByRefreshTokenHash(refreshTokenHash) {
      return devices.find((device) => device.refreshTokenHash === refreshTokenHash) ?? null;
    },
    async approveDevice(params) {
      const device = devices.find((entry) => entry.id === params.deviceId)!;
      device.userId = params.userId;
      device.accessTokenHash = params.accessTokenHash;
      device.refreshTokenHash = params.refreshTokenHash;
      device.approvedAt = params.approvedAt;
      device.accessTokenExpiresAt = params.accessTokenExpiresAt;
      device.refreshTokenExpiresAt = params.refreshTokenExpiresAt;
      device.updatedAt = params.approvedAt;
      return device;
    },
    async rotateDeviceTokens(params) {
      const device = devices.find((entry) => entry.id === params.deviceId)!;
      device.accessTokenHash = params.accessTokenHash;
      device.refreshTokenHash = params.refreshTokenHash;
      device.accessTokenExpiresAt = params.accessTokenExpiresAt;
      device.refreshTokenExpiresAt = params.refreshTokenExpiresAt;
      device.updatedAt = new Date();
      return device;
    },
    async touchDevice(deviceId, lastSeenAt) {
      const device = devices.find((entry) => entry.id === deviceId)!;
      device.lastSeenAt = lastSeenAt;
      device.updatedAt = lastSeenAt;
    },
    async revokeDevice(deviceId, revokedAt) {
      const device = devices.find((entry) => entry.id === deviceId)!;
      device.revokedAt = revokedAt;
      device.accessTokenHash = null;
      device.refreshTokenHash = null;
      device.accessTokenExpiresAt = null;
      device.refreshTokenExpiresAt = null;
      device.updatedAt = revokedAt;
    },
  };
}
