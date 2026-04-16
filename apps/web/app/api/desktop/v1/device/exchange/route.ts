import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopDeviceExchangeSchema } from "@selfbox/common";
import { createDesktopDeviceRepository } from "@/server/desktop/device-repository";
import { exchangeDesktopDeviceFlow } from "@/server/desktop/device-flow";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const payload = desktopDeviceExchangeSchema.parse(await request.json());
    const result = await exchangeDesktopDeviceFlow(
      createDesktopDeviceRepository(getDb()),
      payload,
    );

    return NextResponse.json(result, { status: result.status === "pending" ? 202 : 200 });
  } catch (error) {
    return jsonError(error);
  }
}
