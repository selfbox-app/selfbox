import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFolderRenameSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopRenameFolder } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";
import { withIdempotency } from "@/server/desktop/idempotency";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const { idempotencyKey, ...payload } = desktopFolderRenameSchema.parse(
      await request.json(),
    );
    const folder = await withIdempotency(
      getDb(),
      { key: idempotencyKey, deviceId: device.id, endpoint: "folders/rename" },
      () =>
        desktopRenameFolder(getDb(), {
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
