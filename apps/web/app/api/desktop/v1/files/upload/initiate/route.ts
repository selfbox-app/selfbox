import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFileUploadInitiateSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopInitiateUpload } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const payload = desktopFileUploadInitiateSchema.parse(
      await request.json(),
    );
    const result = await desktopInitiateUpload(getDb(), {
      ...payload,
      actorUserId: device.userId!,
      actorDeviceId: device.id,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
