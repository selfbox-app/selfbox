import { NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { desktopSyncChangesSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { jsonError } from "@/server/desktop/http";
import { listDesktopWorkspaceChanges } from "@/server/desktop/sync";

export async function GET(request: Request) {
  try {
    const device = await authenticateDesktopRequest(request);
    const url = new URL(request.url);
    const payload = desktopSyncChangesSchema.parse({
      workspaceId: url.searchParams.get("workspaceId"),
      cursor: url.searchParams.get("cursor") ?? 0,
      limit: url.searchParams.get("limit") ?? 200,
    });

    const changes = await listDesktopWorkspaceChanges(getDb(), {
      userId: device.userId!,
      workspaceId: payload.workspaceId,
      cursor: payload.cursor,
      limit: payload.limit,
    });

    return NextResponse.json(changes);
  } catch (error) {
    return jsonError(error);
  }
}
