import { eq } from "drizzle-orm";
import { desktopDevices } from "@selfbox/database";
import type { Database } from "@selfbox/database";
import type { DesktopDeviceRecord, DesktopDeviceRepository } from "./device-flow";

function mapDevice(row: typeof desktopDevices.$inferSelect): DesktopDeviceRecord {
  return row;
}

export function createDesktopDeviceRepository(
  db: Database,
): DesktopDeviceRepository {
  return {
    async createPendingDevice(input) {
      const [device] = await db
        .insert(desktopDevices)
        .values({
          clientName: input.clientName ?? null,
          clientVersion: input.clientVersion ?? null,
          platform: input.platform,
          userCode: input.userCode,
          deviceCodeHash: input.deviceCodeHash,
          approvalExpiresAt: input.approvalExpiresAt,
        })
        .returning();

      return mapDevice(device!);
    },

    async findByUserCode(userCode) {
      const [device] = await db
        .select()
        .from(desktopDevices)
        .where(eq(desktopDevices.userCode, userCode))
        .limit(1);

      return device ? mapDevice(device) : null;
    },

    async findByDeviceCodeHash(deviceCodeHash) {
      const [device] = await db
        .select()
        .from(desktopDevices)
        .where(eq(desktopDevices.deviceCodeHash, deviceCodeHash))
        .limit(1);

      return device ? mapDevice(device) : null;
    },

    async findByAccessTokenHash(accessTokenHash) {
      const [device] = await db
        .select()
        .from(desktopDevices)
        .where(eq(desktopDevices.accessTokenHash, accessTokenHash))
        .limit(1);

      return device ? mapDevice(device) : null;
    },

    async findByRefreshTokenHash(refreshTokenHash) {
      const [device] = await db
        .select()
        .from(desktopDevices)
        .where(eq(desktopDevices.refreshTokenHash, refreshTokenHash))
        .limit(1);

      return device ? mapDevice(device) : null;
    },

    async approveDevice(params) {
      const [device] = await db
        .update(desktopDevices)
        .set({
          userId: params.userId,
          accessTokenHash: params.accessTokenHash,
          refreshTokenHash: params.refreshTokenHash,
          approvedAt: params.approvedAt,
          accessTokenExpiresAt: params.accessTokenExpiresAt,
          refreshTokenExpiresAt: params.refreshTokenExpiresAt,
          revokedAt: null,
          updatedAt: params.approvedAt,
        })
        .where(eq(desktopDevices.id, params.deviceId))
        .returning();

      return mapDevice(device!);
    },

    async rotateDeviceTokens(params) {
      const [device] = await db
        .update(desktopDevices)
        .set({
          accessTokenHash: params.accessTokenHash,
          refreshTokenHash: params.refreshTokenHash,
          accessTokenExpiresAt: params.accessTokenExpiresAt,
          refreshTokenExpiresAt: params.refreshTokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(desktopDevices.id, params.deviceId))
        .returning();

      return mapDevice(device!);
    },

    async touchDevice(deviceId, lastSeenAt) {
      await db
        .update(desktopDevices)
        .set({ lastSeenAt, updatedAt: lastSeenAt })
        .where(eq(desktopDevices.id, deviceId));
    },

    async revokeDevice(deviceId, revokedAt) {
      await db
        .update(desktopDevices)
        .set({
          accessTokenHash: null,
          refreshTokenHash: null,
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          revokedAt,
          updatedAt: revokedAt,
        })
        .where(eq(desktopDevices.id, deviceId));
    },
  };
}
