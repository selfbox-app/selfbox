import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFolderMoveSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopMoveFolder } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";
import { withIdempotency } from "@/server/desktop/idempotency";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const { idempotencyKey, ...payload } = desktopFolderMoveSchema.parse(
      await request.json(),
    );
    const folder = await withIdempotency(
      getDb(),
      { key: idempotencyKey, deviceId: device.id, endpoint: "folders/move" },
      () =>
        desktopMoveFolder(getDb(), {
          ...payload,
          actorUserId: device.userId!,
          actorDeviceId: device.id,
        }),
    );

    return NextResponse.json(folder);
  } catch (error) {
    return jsonError(error);
  }
}
