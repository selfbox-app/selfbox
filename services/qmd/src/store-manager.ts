import { createStore } from "@tobilu/qmd";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

type QMDStore = Awaited<ReturnType<typeof createStore>>;

const QMD_DATA_DIR = process.env.QMD_DATA_DIR || "./data/qmd";
const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const INDEXABLE_MIME_PREFIXES = ["text/"];
const INDEXABLE_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/pdf",
  "application/rtf",
]);

interface StoreEntry {
  store: QMDStore;
  timer: ReturnType<typeof setTimeout>;
  mutex: Promise<void>;
}

const stores = new Map<string, StoreEntry>();
const pendingOpens = new Map<string, Promise<QMDStore>>();

// Simple TTL cache for search results
const SEARCH_CACHE_TTL_MS = 60_000; // 1 minute
interface CachedSearch {
  results: Array<{ fileId: string; score: number; snippet?: string }>;
  expiresAt: number;
}
const searchCache = new Map<string, CachedSearch>();

function searchCacheKey(
  workspaceId: string,
  query: string,
  limit: number,
): string {
  return `${workspaceId}:${limit}:${query}`;
}

function isIndexable(mimeType: string): boolean {
  return (
    INDEXABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) ||
    INDEXABLE_MIME_TYPES.has(mimeType)
  );
}

function getDbPath(workspaceId: string): string {
  const dir = join(QMD_DATA_DIR, workspaceId);
  mkdirSync(dir, { recursive: true });
  return join(dir, "index.sqlite");
}

function resetTimer(workspaceId: string, entry: StoreEntry): void {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    const evicted = stores.get(workspaceId);
    stores.delete(workspaceId);
    if (evicted) {
      try {
        evicted.store.close();
      } catch {}
    }
    console.log(`[qmd] Closed idle store for workspace ${workspaceId}`);
  }, INACTIVITY_MS);
}

async function getStore(workspaceId: string): Promise<QMDStore> {
  const existing = stores.get(workspaceId);
  if (existing) {
    resetTimer(workspaceId, existing);
    return existing.store;
  }

  // Prevent concurrent createStore calls for the same workspace
  const pending = pendingOpens.get(workspaceId);
  if (pending) return pending;

  const opening = (async () => {
    const dbPath = getDbPath(workspaceId);
    const store = await createStore({ dbPath });

    const entry: StoreEntry = {
      store,
      timer: setTimeout(() => {}, 0),
      mutex: Promise.resolve(),
    };
    resetTimer(workspaceId, entry);
    stores.set(workspaceId, entry);

    console.log(`[qmd] Opened store for workspace ${workspaceId}`);
    return store;
  })();

  pendingOpens.set(workspaceId, opening);
  try {
    return await opening;
  } finally {
    pendingOpens.delete(workspaceId);
  }
}

function withMutex(
  workspaceId: string,
  fn: () => Promise<void>,
): Promise<void> {
  const entry = stores.get(workspaceId);
  if (!entry) return fn();

  const prev = entry.mutex;
  const next = prev.then(fn, fn);
  entry.mutex = next.then(
    () => {},
    () => {},
  );
  return next;
}

export async function indexFile(params: {
  workspaceId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  content: string;
}): Promise<void> {
  if (!isIndexable(params.mimeType)) {
    return;
  }

  if (params.content.length > MAX_FILE_SIZE) {
    return;
  }

  const store = await getStore(params.workspaceId);

  await withMutex(params.workspaceId, async () => {
    const hash = createHash("sha256").update(params.content).digest("hex");
    const now = new Date().toISOString();

    await store.internal.insertContent(hash, params.content, now);
    await store.internal.insertDocument(
      "workspace",
      params.fileId,
      params.fileName,
      hash,
      now,
      now,
    );
    await store.embed();
  });

  invalidateCache(params.workspaceId);
  console.log(`[qmd] Indexed file ${params.fileId} (${params.fileName})`);
}

export async function deindexFile(params: {
  workspaceId: string;
  fileId: string;
}): Promise<void> {
  const store = await getStore(params.workspaceId);

  await withMutex(params.workspaceId, async () => {
    await store.internal.deactivateDocument("workspace", params.fileId);
    await store.internal.deleteInactiveDocuments();
    await store.internal.cleanupOrphanedContent();
  });

  invalidateCache(params.workspaceId);
  console.log(`[qmd] De-indexed file ${params.fileId}`);
}

// Serialize searches per workspace to avoid concurrent embedding work
export async function search(params: {
  workspaceId: string;
  query: string;
  limit?: number;
}): Promise<Array<{ fileId: string; score: number; snippet?: string }>> {
  const limit = params.limit ?? 20;
  const cacheKey = searchCacheKey(params.workspaceId, params.query, limit);

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const store = await getStore(params.workspaceId);

  let results: Awaited<ReturnType<typeof store.search>>;
  await withMutex(params.workspaceId, async () => {
    results = await store.search({ query: params.query, limit });
  });

  const mapped = results!.slice(0, limit).map((r) => ({
    fileId: r.path,
    score: r.score ?? 1,
    snippet: r.content?.slice(0, 200),
  }));

  searchCache.set(cacheKey, {
    results: mapped,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });

  return mapped;
}

function invalidateCache(workspaceId: string): void {
  for (const key of searchCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      searchCache.delete(key);
    }
  }
}

/** Pre-load the embedding model so the first real search is fast. */
export async function warmup(): Promise<void> {
  const dbPath = join(QMD_DATA_DIR, "_warmup", "index.sqlite");
  mkdirSync(join(QMD_DATA_DIR, "_warmup"), { recursive: true });
  const store = await createStore({ dbPath });
  await store.search({ query: "warmup", limit: 1 }).catch(() => {});
  store.close();
  console.log("[qmd] Model warmup complete");
}

export function getStoreCount(): number {
  return stores.size;
}

export function closeAll(): void {
  for (const [id, entry] of stores) {
    clearTimeout(entry.timer);
    try {
      entry.store.close();
    } catch {}
    stores.delete(id);
  }
  console.log("[qmd] Closed all stores");
}
