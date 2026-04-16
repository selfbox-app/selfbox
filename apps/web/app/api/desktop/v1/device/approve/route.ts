import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getDb } from "@selfbox/database/client";
import { desktopDeviceApproveSchema } from "@selfbox/common";
import { auth } from "@/server/auth";
import { createDesktopDeviceRepository } from "@/server/desktop/device-repository";
import { approveDesktopDeviceFlow } from "@/server/desktop/device-flow";
import { jsonError } from "@/server/desktop/http";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "unauthorized" },
        { status: 401 },
      );
    }

    const payload = desktopDeviceApproveSchema.parse(await request.json());
    await approveDesktopDeviceFlow(createDesktopDeviceRepository(getDb()), {
      userCode: payload.userCode,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
