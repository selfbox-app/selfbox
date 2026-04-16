import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { files } from "@selfbox/database";
import { getDb } from "@selfbox/database/client";
import { authenticateDesktopRequest } from "@/server/desktop/auth";
import { requireWorkspaceMembership } from "@/server/desktop/sync";
import { jsonError } from "@/server/desktop/http";
import { createStorageForFile } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-buffered upload for desktop clients. Used when the configured
 * storage backend doesn't support presigned URLs (e.g. local disk).
 *
 * Streams the request body to the storage path returned by
 * `/files/upload/initiate` or `/files/update/initiate`. Doesn't touch the
 * `files` row — the caller is expected to follow up with the matching
 * `/complete` endpoint, which verifies the checksum and flips status to
 * ready (and emits the sync event).
 *
 * Headers:
 *  - x-workspace-id: target workspace
 *  - x-file-id:      file row id (must be in status "uploading" or "updating")
 *  - x-storage-path: required for "updating" status (sidecar pending path
 *                    returned by /files/update/initiate). Ignored for
 *                    "uploading" status — the destination is read from
 *                    the file row instead, since user-supplied filenames
 *                    may contain non-ASCII characters that get mangled
 *                    when they ride through HTTP headers (e.g. macOS
 *                    screenshots use U+202F before "pm"/"am").
 *  - content-length: required, must match the initiated size
 */
export async function PUT(request: NextRequest) {
  try {
    const device = await authenticateDesktopRequest(request);
    const db = getDb();

    const workspaceId = request.headers.get("x-workspace-id");
    const fileId = request.headers.get("x-file-id");
    const headerStoragePath = request.headers.get("x-storage-path");
    const contentType =
      request.headers.get("content-type") ?? "application/octet-stream";
    const contentLengthHeader = request.headers.get("content-length");

    if (!workspaceId || !fileId) {
      return NextResponse.json(
        {
          error: "Missing x-workspace-id or x-file-id header",
          code: "missing_headers",
        },
        { status: 400 },
      );
    }

    if (!request.body) {
      return NextResponse.json(
        { error: "Missing request body", code: "no_body" },
        { status: 400 },
      );
    }

    const contentLength = Number.parseInt(contentLengthHeader ?? "", 10);
    if (!Number.isFinite(contentLength) || contentLength <= 0) {
      return NextResponse.json(
        {
          error: "Missing or invalid content-length header",
          code: "bad_content_length",
        },
        { status: 400 },
      );
    }

    await requireWorkspaceMembership(db, {
      userId: device.userId!,
      workspaceId,
    });

    // Look up the file row to resolve the storage config and the
    // upload-flow destination path.
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.workspaceId, workspaceId)));

    if (!file) {
      return NextResponse.json(
        { error: "File not found for stream upload", code: "not_found" },
        { status: 404 },
      );
    }
    if (file.status !== "uploading" && file.status !== "updating") {
      return NextResponse.json(
        {
          error: `File is not in an upload-in-progress state (status=${file.status})`,
          code: "bad_status",
        },
        { status: 409 },
      );
    }

    // For fresh uploads use the live storage path from the file row
    // (filename is user-supplied and may contain non-ASCII). For content
    // updates, the destination is the sidecar pending path returned by
    // /files/update/initiate — that path is ASCII (`pending-<uuid>`), so
    // it survives the HTTP-header round-trip.
    let destination: string;
    if (file.status === "updating") {
      if (!headerStoragePath) {
        return NextResponse.json(
          {
            error: "x-storage-path header is required for content updates",
            code: "missing_storage_path",
          },
          { status: 400 },
        );
      }
      // Same workspace-rooting guardrail as before: the pending path
      // returned by initiate is always `${workspaceId}/...`.
      if (!headerStoragePath.startsWith(`${workspaceId}/`)) {
        return NextResponse.json(
          {
            error: "storage path is not rooted in the requested workspace",
            code: "bad_storage_path",
          },
          { status: 400 },
        );
      }
      destination = headerStoragePath;
    } else {
      destination = file.storagePath;
    }

    const storage = await createStorageForFile(file.storageConfigId);

    try {
      await storage.upload({
        path: destination,
        data: request.body as unknown as ReadableStream,
        contentType,
      });
    } catch (err) {
      // Best-effort cleanup of any partial bytes.
      try {
        await storage.delete(destination);
      } catch {
        // ignore
      }
      throw err;
    }

    return NextResponse.json({ success: true, fileId });
  } catch (error) {
    return jsonError(error);
  }
}
