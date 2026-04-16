import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@selfbox/database/client";
import { desktopFileUpdateCompleteSchema } from "@selfbox/common";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { desktopCompleteUpdate } from "@/server/desktop/mutations";
import { jsonError } from "@/server/desktop/http";

// Extend the base schema with the pendingPath field the client received
// during initiate.
const completeSchema = desktopFileUpdateCompleteSchema.extend({
  pendingPath: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const payload = completeSchema.parse(await request.json());
    const result = await desktopCompleteUpdate(getDb(), {
      ...payload,
      actorUserId: device.userId!,
      actorDeviceId: device.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
