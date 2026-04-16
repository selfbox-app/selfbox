import { getDb } from "@selfbox/database/client";
import { createDesktopDeviceRepository } from "./device-repository";
import {
  authenticateDesktopAccessToken,
  DesktopDeviceFlowError,
} from "./device-flow";

export async function authenticateDesktopRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new DesktopDeviceFlowError("Missing bearer token", "invalid_token");
  }

  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) {
    throw new DesktopDeviceFlowError("Missing bearer token", "invalid_token");
  }

  const db = getDb();
  const repo = createDesktopDeviceRepository(db);
  return authenticateDesktopAccessToken(repo, accessToken);
}
