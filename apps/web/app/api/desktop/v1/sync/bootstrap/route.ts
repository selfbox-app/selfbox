import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopWorkspaceSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { jsonError } from "@/server/desktop/http";
import { bootstrapDesktopWorkspace } from "@/server/desktop/sync";

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const payload = desktopWorkspaceSchema.parse(await request.json());
    const bootstrap = await bootstrapDesktopWorkspace(getDb(), {
      userId: device.userId!,
      workspaceId: payload.workspaceId,
    });

    return NextResponse.json(bootstrap);
  } catch (error) {
    return jsonError(error);
  }
}
