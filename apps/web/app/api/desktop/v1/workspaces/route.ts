import { NextResponse } from "next/server";
import { getDb } from "@selfbox/database/client";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { jsonError } from "@/server/desktop/http";
import { listDesktopWorkspaces } from "@/server/desktop/sync";

export async function GET(request: Request) {
  try {
    const device = await authenticateDesktopRequest(request);
    const workspaces = await listDesktopWorkspaces(getDb(), device.userId!);
    return NextResponse.json({ workspaces });
  } catch (error) {
    return jsonError(error);
  }
}
