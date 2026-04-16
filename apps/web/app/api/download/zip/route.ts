import { NextRequest } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";
import { getDb } from "@selfbox/database/client";
import { files, folders, workspaceMembers } from "@selfbox/database";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { createStorageForFile } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Auth check
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const { fileIds, folderIds, workspaceId } = body as {
    fileIds: string[];
    folderIds: string[];
    workspaceId: string;
  };

  if (!workspaceId || (!fileIds?.length && !folderIds?.length)) {
    return new Response("Bad request", { status: 400 });
  }

  // Verify workspace membership
  const db = getDb();
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id),
      ),
    );

  if (!membership) {
    return new Response("Forbidden", { status: 403 });
  }

  // Collect all files to include (direct files + files inside selected folders)
  const allFiles: { id: string; name: string; storagePath: string; storageConfigId: string | null; folderPath: string }[] = [];

  // Add directly selected files
  if (fileIds?.length) {
    const selectedFiles = await db
      .select({
        id: files.id,
        name: files.name,
        storagePath: files.storagePath,
        storageConfigId: files.storageConfigId,
      })
      .from(files)
      .where(
        and(eq(files.workspaceId, workspaceId), inArray(files.id, fileIds)),
      );

    for (const f of selectedFiles) {
      allFiles.push({ ...f, folderPath: "" });
    }
  }

  // Add files from selected folders (recursively)
  if (folderIds?.length) {
    await collectFolderFiles(db, workspaceId, folderIds, "", allFiles);
  }

  if (allFiles.length === 0) {
    return new Response("No files to download", { status: 404 });
  }

  // Create zip stream
  const archive = archiver("zip", { zlib: { level: 5 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  // Stream files into the archive
  (async () => {
    for (const file of allFiles) {
      try {
        const storage = await createStorageForFile(file.storageConfigId);
        const result = await storage.download(file.storagePath);
        const entryName = file.folderPath
          ? `${file.folderPath}/${file.name}`
          : file.name;
        archive.append(Readable.fromWeb(result.data as import("node:stream/web").ReadableStream), {
          name: entryName,
        });
      } catch {
        // Skip files that fail to download
      }
    }
    await archive.finalize();
  })();

  const webStream = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk) => controller.enqueue(chunk));
      passthrough.on("end", () => controller.close());
      passthrough.on("error", (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="selfbox-download.zip"`,
    },
  });
}

/** Recursively collect files inside folders */
async function collectFolderFiles(
  db: ReturnType<typeof getDb>,
  workspaceId: string,
  folderIds: string[],
  parentPath: string,
  result: { id: string; name: string; storagePath: string; storageConfigId: string | null; folderPath: string }[],
) {
  // Get folder names
  const selectedFolders = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(
      and(eq(folders.workspaceId, workspaceId), inArray(folders.id, folderIds)),
    );

  for (const folder of selectedFolders) {
    const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

    // Get files in this folder
    const folderFiles = await db
      .select({
        id: files.id,
        name: files.name,
        storagePath: files.storagePath,
        storageConfigId: files.storageConfigId,
      })
      .from(files)
      .where(
        and(eq(files.workspaceId, workspaceId), eq(files.folderId, folder.id)),
      );

    for (const f of folderFiles) {
      result.push({ ...f, folderPath });
    }

    // Get child folders and recurse
    const childFolders = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.workspaceId, workspaceId),
          eq(folders.parentId, folder.id),
        ),
      );

    if (childFolders.length > 0) {
      await collectFolderFiles(
        db,
        workspaceId,
        childFolders.map((f) => f.id),
        folderPath,
        result,
      );
    }
  }
}
