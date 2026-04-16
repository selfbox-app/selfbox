import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopDeviceRefreshSchema } from "@selfbox/common";
import { createDesktopDeviceRepository } from "@/server/desktop/device-repository";
import { refreshDesktopDeviceFlow } from "@/server/desktop/device-flow";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const payload = desktopDeviceRefreshSchema.parse(await request.json());
    const refreshed = await refreshDesktopDeviceFlow(
      createDesktopDeviceRepository(getDb()),
      payload,
    );

    return NextResponse.json(refreshed);
  } catch (error) {
    return jsonError(error);
  }
}
