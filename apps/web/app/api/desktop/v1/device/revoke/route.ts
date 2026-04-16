import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { createDesktopDeviceRepository } from "@/server/desktop/device-repository";
import { revokeDesktopDeviceFlow } from "@/server/desktop/device-flow";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const body = (await request.json().catch(() => ({}))) as {
      refreshToken?: string;
    };
    const token = bearerToken ?? body.refreshToken;

    if (!token) {
      return NextResponse.json(
        { error: "Missing device token", code: "invalid_request" },
        { status: 400 },
      );
    }

    await revokeDesktopDeviceFlow(createDesktopDeviceRepository(getDb()), token);
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
