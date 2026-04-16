import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFileDeleteSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopDeleteFile } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";
import { withIdempotency } from "@/server/desktop/idempotency";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const { idempotencyKey, ...payload } = desktopFileDeleteSchema.parse(
      await request.json(),
    );
    const result = await withIdempotency(
      getDb(),
      { key: idempotencyKey, deviceId: device.id, endpoint: "files/delete" },
      () =>
        desktopDeleteFile(getDb(), {
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
