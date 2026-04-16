import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFileMoveSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopMoveFile } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";
import { withIdempotency } from "@/server/desktop/idempotency";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const { idempotencyKey, ...payload } = desktopFileMoveSchema.parse(
      await request.json(),
    );
    const result = await withIdempotency(
      getDb(),
      { key: idempotencyKey, deviceId: device.id, endpoint: "files/move" },
      () =>
        desktopMoveFile(getDb(), {
          ...payload,
          actorUserId: device.userId!,
          actorDeviceId: device.id,
        }),
    );

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
