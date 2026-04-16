import { describe, expect, it } from "vitest";
import {
  DesktopVersionConflictError,
  DesktopChecksumMismatchError,
  jsonError,
} from "@/server/desktop/http";

describe("desktop http error handling", () => {
  it("returns 409 with entity details for version conflict", async () => {
    const error = new DesktopVersionConflictError("file-123", 5);
    const response = jsonError(error);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("version_conflict");
    expect(body.entityId).toBe("file-123");
    expect(body.currentVersion).toBe(5);
  });

  it("returns 422 with checksum details for mismatch", async () => {
    const error = new DesktopChecksumMismatchError(
      "file-456",
      "aaaa".repeat(16),
      "bbbb".repeat(16),
    );
    const response = jsonError(error);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("checksum_mismatch");
    expect(body.fileId).toBe("file-456");
    expect(body.expected).toBe("aaaa".repeat(16));
    expect(body.actual).toBe("bbbb".repeat(16));
  });

  it("returns 500 for generic errors", async () => {
    const response = jsonError(new Error("something broke"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.code).toBe("internal_error");
  });
});
