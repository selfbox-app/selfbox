import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const FTS_DATA_DIR = process.env.FTS_DATA_DIR || "./data/fts";
const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

const INDEXABLE_PREFIXES = ["text/"];
const INDEXABLE_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/pdf",
  "application/rtf",
]);

interface DbEntry {
  db: Database.Database;
  timer: ReturnType<typeof setTimeout>;
}

const openDbs = new Map<string, DbEntry>();

function isIndexable(mimeType: string): boolean {
  return (
    INDEXABLE_PREFIXES.some((p) => mimeType.startsWith(p)) ||
    INDEXABLE_TYPES.has(mimeType)
  );
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      file_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      content TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      file_name,
      content,
      content=documents,
      content_rowid=rowid
    );
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, file_name, content)
        VALUES (new.rowid, new.file_name, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, file_name, content)
        VALUES ('delete', old.rowid, old.file_name, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, file_name, content)
        VALUES ('delete', old.rowid, old.file_name, old.content);
      INSERT INTO documents_fts(rowid, file_name, content)
        VALUES (new.rowid, new.file_name, new.content);
    END;
  `);
}

function getDb(workspaceId: string): Database.Database {
  const existing = openDbs.get(workspaceId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => closeDb(workspaceId), INACTIVITY_MS);
    return existing.db;
  }

  const dir = join(FTS_DATA_DIR, workspaceId);
  mkdirSync(dir, { recursive: true });

  const db = new Database(join(dir, "fts.sqlite"));
  db.pragma("journal_mode = WAL");
  initSchema(db);

  const entry: DbEntry = {
    db,
    timer: setTimeout(() => closeDb(workspaceId), INACTIVITY_MS),
  };
  openDbs.set(workspaceId, entry);
  console.log(`[fts] Opened store for workspace ${workspaceId}`);

  return db;
}

function closeDb(workspaceId: string): void {
  const entry = openDbs.get(workspaceId);
  if (!entry) return;
  clearTimeout(entry.timer);
  try {
    entry.db.close();
  } catch {}
  openDbs.delete(workspaceId);
  console.log(`[fts] Closed idle store for workspace ${workspaceId}`);
}

export function indexFile(params: {
  workspaceId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  content: string;
}): void {
  if (!isIndexable(params.mimeType)) return;
  if (params.content.length > MAX_CONTENT_SIZE) return;

  const db = getDb(params.workspaceId);
  db.prepare(
    `INSERT INTO documents (file_id, file_name, content, indexed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET
       file_name = excluded.file_name,
       content = excluded.content,
       indexed_at = excluded.indexed_at`,
  ).run(
    params.fileId,
    params.fileName,
    params.content,
    new Date().toISOString(),
  );

  console.log(`[fts] Indexed file ${params.fileId} (${params.fileName})`);
}

export function deindexFile(params: {
  workspaceId: string;
  fileId: string;
}): void {
  const db = getDb(params.workspaceId);
  db.prepare("DELETE FROM documents WHERE file_id = ?").run(params.fileId);
  console.log(`[fts] De-indexed file ${params.fileId}`);
}

export function search(params: {
  workspaceId: string;
  query: string;
  limit?: number;
}): Array<{ fileId: string; score: number; snippet?: string }> {
  const db = getDb(params.workspaceId);
  const limit = params.limit ?? 20;

  const terms = params.query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");

  if (!terms) return [];

  const rows = db
    .prepare(
      `SELECT
         d.file_id,
         rank * -1 AS score,
         snippet(documents_fts, 1, '', '', '…', 32) AS snippet
       FROM documents_fts
       JOIN documents d ON d.rowid = documents_fts.rowid
       WHERE documents_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(terms, limit) as Array<{
    file_id: string;
    score: number;
    snippet: string;
  }>;

  return rows.map((r) => ({
    fileId: r.file_id,
    score: r.score,
    snippet: r.snippet,
  }));
}

export function getStoreCount(): number {
  return openDbs.size;
}

export function closeAll(): void {
  for (const id of [...openDbs.keys()]) {
    closeDb(id);
  }
  console.log("[fts] Closed all stores");
}
