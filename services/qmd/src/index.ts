import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  indexFile,
  deindexFile,
  search,
  getStoreCount,
  closeAll,
  warmup,
} from "./store-manager.js";

const PORT = parseInt(process.env.QMD_PORT || "9600", 10);
const API_SECRET = process.env.QMD_API_SECRET;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const API_SECRET_HASH = API_SECRET
  ? createHash("sha256").update(API_SECRET).digest()
  : null;

function isAuthenticated(req: IncomingMessage): boolean {
  if (!API_SECRET_HASH) return true; // No secret configured = open (dev mode)
  const header = req.headers["authorization"] ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tokenHash = createHash("sha256").update(token).digest();
  return timingSafeEqual(tokenHash, API_SECRET_HASH);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "GET" && url === "/health") {
    json(res, 200, { status: "ok", workspaces: getStoreCount() });
    return;
  }

  if (!isAuthenticated(req)) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  if (method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  if (url === "/index") {
    const { workspaceId, fileId, fileName, mimeType, content } = body as {
      workspaceId: string;
      fileId: string;
      fileName: string;
      mimeType: string;
      content: string;
    };

    if (!workspaceId || !fileId || !fileName || !content) {
      json(res, 400, {
        error:
          "Missing required fields: workspaceId, fileId, fileName, content",
      });
      return;
    }

    try {
      await indexFile({
        workspaceId,
        fileId,
        fileName,
        mimeType: mimeType || "text/plain",
        content,
      });
      json(res, 200, { success: true });
    } catch (err) {
      console.error("[qmd] Index error:", err);
      json(res, 500, { error: "Indexing failed" });
    }
    return;
  }

  if (url === "/search") {
    const { workspaceId, query, limit } = body as {
      workspaceId: string;
      query: string;
      limit?: number;
    };

    if (!workspaceId || !query) {
      json(res, 400, { error: "Missing required fields: workspaceId, query" });
      return;
    }

    try {
      const results = await search({ workspaceId, query, limit });
      json(res, 200, { results });
    } catch (err) {
      console.error("[qmd] Search error:", err);
      json(res, 200, { results: [] });
    }
    return;
  }

  if (url === "/deindex") {
    const { workspaceId, fileId } = body as {
      workspaceId: string;
      fileId: string;
    };

    if (!workspaceId || !fileId) {
      json(res, 400, { error: "Missing required fields: workspaceId, fileId" });
      return;
    }

    try {
      await deindexFile({ workspaceId, fileId });
      json(res, 200, { success: true });
    } catch (err) {
      console.error("[qmd] Deindex error:", err);
      json(res, 500, { error: "De-indexing failed" });
    }
    return;
  }

  json(res, 404, { error: "Not found" });
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[qmd] Unhandled error:", err);
    if (!res.headersSent) {
      json(res, 500, { error: "Internal server error" });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[qmd] Service listening on port ${PORT}`);
  console.log(
    `[qmd] Data directory: ${process.env.QMD_DATA_DIR || "./data/qmd"}`,
  );
  if (!API_SECRET) {
    console.warn(
      "[qmd] WARNING: QMD_API_SECRET is not set — endpoints are unauthenticated",
    );
  }

  // Eagerly load the embedding model in the background
  warmup().catch((err) => console.error("[qmd] Warmup failed:", err));
});

process.on("SIGTERM", () => {
  console.log("[qmd] Shutting down...");
  closeAll();
  server.close();
});

process.on("SIGINT", () => {
  console.log("[qmd] Shutting down...");
  closeAll();
  server.close();
});
