import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFileUpdateInitiateSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopInitiateUpdate } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const payload = desktopFileUpdateInitiateSchema.parse(await request.json());
    const result = await desktopInitiateUpdate(getDb(), {
      ...payload,
      actorUserId: device.userId!,
      actorDeviceId: device.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
