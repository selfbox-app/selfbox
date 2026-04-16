import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopFileDownloadUrlSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopGetFile } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const payload = desktopFileDownloadUrlSchema.parse(await request.json());
    const result = await desktopGetFile(getDb(), {
      ...payload,
      actorUserId: device.userId!,
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
