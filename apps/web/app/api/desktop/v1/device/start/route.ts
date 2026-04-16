import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopDeviceStartSchema } from "@selfbox/common";
import { createDesktopDeviceRepository } from "@/server/desktop/device-repository";
import { startDesktopDeviceFlow } from "@/server/desktop/device-flow";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const payload = desktopDeviceStartSchema.parse(await request.json());
    const ticket = await startDesktopDeviceFlow(
      createDesktopDeviceRepository(getDb()),
      {
        ...payload,
        baseUrl:
          process.env.NEXT_PUBLIC_APP_URL ??
          process.env.PORTLESS_URL ??
          request.nextUrl.origin,
      },
    );

    return NextResponse.json(ticket);
  } catch (error) {
    return jsonError(error);
  }
}
