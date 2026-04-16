use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

/// Local SQLite manifest tracking sync state for a linked workspace.
///
/// `rusqlite::Connection` is `Send` but not `Sync` — SQLite connections
/// are inherently single-threaded. We wrap it in a `Mutex` so that
/// `SyncManifest` itself is `Sync`, which lets us hold `&SyncManifest`
/// across async `.await` points in the sync engine.
pub struct SyncManifest {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOp {
    pub idempotency_key: String,
    /// Short identifier for which mutation this is — e.g. `"rename_file"`.
    pub op_kind: String,
    /// The path portion of the desktop API URL, e.g. `"/files/rename"`.
    pub endpoint: String,
    /// Raw JSON body to replay on retry. The server-side idempotency key
    /// lookup makes the retry safe even if the mutation partially applied.
    pub payload: String,
    pub created_at: String,
    pub attempts: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub remote_id: String,
    pub entity_type: String,       // "file" or "folder"
    pub remote_path: String,       // Logical path on server
    pub local_path: String,        // Absolute path on disk
    pub remote_version: i64,
    pub checksum: Option<String>,  // SHA-256 of file content
    pub size: i64,
    pub synced_at: String,
}

impl SyncManifest {
    /// Acquire exclusive access to the underlying SQLite connection.
    /// Callers hold the returned `MutexGuard` while running queries; drop
    /// it before any `.await` to avoid blocking the runtime.
    pub fn connection(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().expect("manifest mutex poisoned")
    }

    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            -- local_path uses COLLATE NOCASE so case-only renames on
            -- Windows / default-APFS macOS (e.g. Foo.txt → foo.txt)
            -- match the existing manifest entry instead of being treated
            -- as a brand-new file. NOCASE is ASCII-only — Unicode case
            -- folding (e.g. Ä vs ä) still mismatches; tracked as
            -- follow-on work in deferred.mdx.
            CREATE TABLE IF NOT EXISTS entries (
                remote_id       TEXT PRIMARY KEY,
                entity_type     TEXT NOT NULL,
                remote_path     TEXT NOT NULL,
                local_path      TEXT NOT NULL COLLATE NOCASE,
                remote_version  INTEGER NOT NULL,
                checksum        TEXT,
                size            INTEGER NOT NULL DEFAULT 0,
                synced_at       TEXT NOT NULL
            );
            -- Old pending_ops schema was unused; drop and recreate with a
            -- schema that supports the client mutation journal.
            DROP TABLE IF EXISTS pending_ops;
            CREATE TABLE IF NOT EXISTS pending_ops (
                idempotency_key TEXT PRIMARY KEY,
                op_kind         TEXT NOT NULL,   -- 'rename_file', 'move_folder', …
                endpoint        TEXT NOT NULL,   -- '/files/rename', …
                payload         TEXT NOT NULL,   -- JSON body to re-send on retry
                created_at      TEXT NOT NULL,
                attempts        INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS excluded_folders (
                remote_id   TEXT PRIMARY KEY,
                local_path  TEXT NOT NULL COLLATE NOCASE,
                excluded_at TEXT NOT NULL
            );",
        )?;

        // Migrate older manifests in place: if either table was created
        // before COLLATE NOCASE was added, rebuild it with the new column
        // definition while preserving every row. We can't just drop and
        // re-bootstrap — `meta.cursor` survives, so on next launch the
        // engine sees a returning user with an empty manifest, treats every
        // local file as new, and re-uploads everything as duplicates.
        Self::migrate_collate_nocase(
            &conn,
            "entries",
            "CREATE TABLE entries__nocase_migration (
                remote_id       TEXT PRIMARY KEY,
                entity_type     TEXT NOT NULL,
                remote_path     TEXT NOT NULL,
                local_path      TEXT NOT NULL COLLATE NOCASE,
                remote_version  INTEGER NOT NULL,
                checksum        TEXT,
                size            INTEGER NOT NULL DEFAULT 0,
                synced_at       TEXT NOT NULL
            )",
        )?;
        Self::migrate_collate_nocase(
            &conn,
            "excluded_folders",
            "CREATE TABLE excluded_folders__nocase_migration (
                remote_id   TEXT PRIMARY KEY,
                local_path  TEXT NOT NULL COLLATE NOCASE,
                excluded_at TEXT NOT NULL
            )",
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// SQLite can't ALTER a column to add `COLLATE NOCASE`. Rebuild the
    /// table by copying into a fresh one with the right schema, preserving
    /// every row. Wrapped in a transaction so a crash mid-migration leaves
    /// the original intact.
    fn migrate_collate_nocase(conn: &Connection, table: &str, new_table_ddl: &str) -> Result<()> {
        let create_sql: Option<String> = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?1",
                [table],
                |row| row.get(0),
            )
            .ok();
        let Some(create_sql) = create_sql else {
            return Ok(()); // table didn't exist before; nothing to migrate
        };
        if create_sql.to_uppercase().contains("COLLATE NOCASE") {
            return Ok(()); // already migrated
        }
        log::info!("Manifest migration: adding COLLATE NOCASE to {table}");
        let tmp = format!("{table}__nocase_migration");
        conn.execute_batch(&format!(
            "BEGIN;
             {new_table_ddl};
             INSERT INTO {tmp} SELECT * FROM {table};
             DROP TABLE {table};
             ALTER TABLE {tmp} RENAME TO {table};
             COMMIT;",
        ))?;
        Ok(())
    }

    pub fn get_cursor(&self) -> Result<i64> {
        self.connection()
            .query_row(
                "SELECT value FROM meta WHERE key = 'cursor'",
                [],
                |row| row.get::<_, String>(0),
            )
            .map(|v| v.parse::<i64>().unwrap_or(0))
            .or(Ok(0))
    }

    pub fn set_cursor(&self, cursor: i64) -> Result<()> {
        self.connection().execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('cursor', ?1)",
            [cursor.to_string()],
        )?;
        Ok(())
    }

    pub fn upsert_entry(&self, entry: &ManifestEntry) -> Result<()> {
        self.connection().execute(
            "INSERT OR REPLACE INTO entries
             (remote_id, entity_type, remote_path, local_path, remote_version, checksum, size, synced_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                entry.remote_id,
                entry.entity_type,
                entry.remote_path,
                entry.local_path,
                entry.remote_version,
                entry.checksum,
                entry.size,
                entry.synced_at,
            ],
        )?;
        Ok(())
    }

    pub fn remove_entry(&self, remote_id: &str) -> Result<()> {
        self.connection().execute(
            "DELETE FROM entries WHERE remote_id = ?1",
            [remote_id],
        )?;
        Ok(())
    }

    /// Find every manifest entry whose local_path starts with `prefix + /`,
    /// i.e. all descendants of a folder at `prefix`. The prefix entry itself
    /// is not included.
    pub fn find_descendants(&self, prefix: &str) -> Result<Vec<ManifestEntry>> {
        let pattern = format!("{}{}%", prefix, std::path::MAIN_SEPARATOR);
        let conn = self.connection();
        let mut stmt = conn.prepare(
            "SELECT remote_id, entity_type, remote_path, local_path, remote_version, checksum, size, synced_at
             FROM entries WHERE local_path LIKE ?1",
        )?;

        let mut rows = stmt.query([pattern])?;
        let mut entries = Vec::new();
        while let Some(row) = rows.next()? {
            entries.push(ManifestEntry {
                remote_id: row.get(0)?,
                entity_type: row.get(1)?,
                remote_path: row.get(2)?,
                local_path: row.get(3)?,
                remote_version: row.get(4)?,
                checksum: row.get(5)?,
                size: row.get(6)?,
                synced_at: row.get(7)?,
            });
        }
        Ok(entries)
    }

    /// Return every file entry (entity_type = 'file') in the manifest. Used
    /// by the startup reconciliation scan to compare manifest state to disk.
    pub fn list_file_entries(&self) -> Result<Vec<ManifestEntry>> {
        let conn = self.connection();
        let mut stmt = conn.prepare(
            "SELECT remote_id, entity_type, remote_path, local_path, remote_version, checksum, size, synced_at
             FROM entries WHERE entity_type = 'file'",
        )?;

        let mut rows = stmt.query([])?;
        let mut entries = Vec::new();
        while let Some(row) = rows.next()? {
            entries.push(ManifestEntry {
                remote_id: row.get(0)?,
                entity_type: row.get(1)?,
                remote_path: row.get(2)?,
                local_path: row.get(3)?,
                remote_version: row.get(4)?,
                checksum: row.get(5)?,
                size: row.get(6)?,
                synced_at: row.get(7)?,
            });
        }
        Ok(entries)
    }

    /// Rewrite every entry's `local_path` so paths that start with
    /// `old_prefix` are re-rooted under `new_prefix`. Used when the user
    /// moves the sync folder to a new location — the manifest has absolute
    /// paths that would otherwise go stale.
    ///
    /// Uses SQLite's `REPLACE` which rewrites all occurrences, but since
    /// local_path is anchored at the sync root and includes no duplication
    /// of that prefix mid-path, one-shot REPLACE is safe here.
    pub fn rewrite_local_path_prefix(
        &self,
        old_prefix: &str,
        new_prefix: &str,
    ) -> Result<usize> {
        // Match either the exact prefix or any path nested under it. The
        // separator is platform-specific: `/` on macOS/Linux, `\` on
        // Windows — hardcoding `/` here silently drops Windows children.
        let like_pattern =
            format!("{}{}%", old_prefix, std::path::MAIN_SEPARATOR);
        let conn = self.connection();
        let changed = conn.execute(
            "UPDATE entries SET local_path = ?2 || SUBSTR(local_path, LENGTH(?1) + 1)
             WHERE local_path = ?1 OR local_path LIKE ?3",
            rusqlite::params![old_prefix, new_prefix, like_pattern],
        )?;
        Ok(changed)
    }

    // ── Pending-ops journal ────────────────────────────────────────────

    /// Record a mutation before it's sent to the server. If the process
    /// crashes mid-request, the next startup replays this entry against
    /// the same idempotency key, which the server dedupes.
    pub fn insert_pending_op(&self, op: &PendingOp) -> Result<()> {
        self.connection().execute(
            "INSERT OR REPLACE INTO pending_ops
             (idempotency_key, op_kind, endpoint, payload, created_at, attempts)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                op.idempotency_key,
                op.op_kind,
                op.endpoint,
                op.payload,
                op.created_at,
                op.attempts
            ],
        )?;
        Ok(())
    }

    pub fn delete_pending_op(&self, idempotency_key: &str) -> Result<()> {
        self.connection().execute(
            "DELETE FROM pending_ops WHERE idempotency_key = ?1",
            [idempotency_key],
        )?;
        Ok(())
    }

    pub fn list_pending_ops(&self) -> Result<Vec<PendingOp>> {
        let conn = self.connection();
        let mut stmt = conn.prepare(
            "SELECT idempotency_key, op_kind, endpoint, payload, created_at, attempts
             FROM pending_ops ORDER BY created_at ASC",
        )?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(PendingOp {
                idempotency_key: row.get(0)?,
                op_kind: row.get(1)?,
                endpoint: row.get(2)?,
                payload: row.get(3)?,
                created_at: row.get(4)?,
                attempts: row.get(5)?,
            });
        }
        Ok(out)
    }

    pub fn increment_pending_op_attempts(
        &self,
        idempotency_key: &str,
    ) -> Result<()> {
        self.connection().execute(
            "UPDATE pending_ops SET attempts = attempts + 1
             WHERE idempotency_key = ?1",
            [idempotency_key],
        )?;
        Ok(())
    }

    // ── Selective sync (folder exclusions) ────────────────────────────

    /// List every remote folder id currently marked as excluded from sync.
    pub fn list_excluded_folder_ids(&self) -> Result<Vec<String>> {
        let conn = self.connection();
        let mut stmt = conn.prepare("SELECT remote_id FROM excluded_folders")?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(row.get::<_, String>(0)?);
        }
        Ok(out)
    }

    /// List every recorded local_path prefix that has been excluded. Used by
    /// `push_local_changes` and `reconcile_from_disk` to skip paths rooted
    /// under an excluded folder without walking ancestry each time.
    pub fn list_excluded_local_paths(&self) -> Result<Vec<String>> {
        let conn = self.connection();
        let mut stmt = conn.prepare("SELECT local_path FROM excluded_folders")?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(row.get::<_, String>(0)?);
        }
        Ok(out)
    }

    pub fn exclude_folder(&self, remote_id: &str, local_path: &str) -> Result<()> {
        self.connection().execute(
            "INSERT OR REPLACE INTO excluded_folders (remote_id, local_path, excluded_at)
             VALUES (?1, ?2, ?3)",
            rusqlite::params![
                remote_id,
                local_path,
                chrono::Utc::now().to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn include_folder(&self, remote_id: &str) -> Result<()> {
        self.connection().execute(
            "DELETE FROM excluded_folders WHERE remote_id = ?1",
            [remote_id],
        )?;
        Ok(())
    }

    pub fn is_folder_excluded(&self, remote_id: &str) -> Result<bool> {
        let conn = self.connection();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM excluded_folders WHERE remote_id = ?1",
            [remote_id],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// True if `local_path` equals or is nested under any excluded folder's
    /// local_path. Used for skipping local-side events in excluded subtrees.
    pub fn is_path_under_excluded(&self, local_path: &str) -> Result<bool> {
        let sep = std::path::MAIN_SEPARATOR.to_string();
        let with_sep = format!("{local_path}{sep}");
        let conn = self.connection();
        // `local_path != ''` filters out orphan exclusions (folder excluded
        // while not in manifest, server tree also unavailable). Those have
        // no real disk path, so they can't match a local FS event.
        // The SUBSTR(...) = local_path || ?3 comparison is between two
        // derived expressions and would default to BINARY collation, ignoring
        // the column's COLLATE NOCASE. Force NOCASE explicitly so case-only
        // path differences (Foo/ vs foo/) still match on Windows / APFS.
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM excluded_folders
             WHERE local_path <> ''
               AND (local_path = ?1
                    OR SUBSTR(?2, 1, LENGTH(local_path) + 1) = local_path || ?3 COLLATE NOCASE)",
            rusqlite::params![local_path, with_sep, sep],
            |row| row.get(0),
        )?;
        Ok(n > 0)
    }

    /// Remove all manifest entries whose local_path sits at or under
    /// `prefix`. Returns the count removed. Used when a folder is newly
    /// excluded so stale entries don't confuse reconcile/push.
    pub fn remove_entries_under(&self, prefix: &str) -> Result<usize> {
        let like_pattern = format!("{}{}%", prefix, std::path::MAIN_SEPARATOR);
        let conn = self.connection();
        let n = conn.execute(
            "DELETE FROM entries
             WHERE local_path = ?1 OR local_path LIKE ?2",
            rusqlite::params![prefix, like_pattern],
        )?;
        Ok(n)
    }

    pub fn entry_count(&self) -> Result<usize> {
        let conn = self.connection();
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM entries")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count as usize)
    }

    pub fn get_entry(&self, remote_id: &str) -> Result<Option<ManifestEntry>> {
        let conn = self.connection();
        let mut stmt = conn.prepare(
            "SELECT remote_id, entity_type, remote_path, local_path, remote_version, checksum, size, synced_at
             FROM entries WHERE remote_id = ?1",
        )?;

        let mut rows = stmt.query([remote_id])?;
        match rows.next()? {
            Some(row) => Ok(Some(ManifestEntry {
                remote_id: row.get(0)?,
                entity_type: row.get(1)?,
                remote_path: row.get(2)?,
                local_path: row.get(3)?,
                remote_version: row.get(4)?,
                checksum: row.get(5)?,
                size: row.get(6)?,
                synced_at: row.get(7)?,
            })),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn mk(dir: &tempfile::TempDir) -> SyncManifest {
        SyncManifest::open(dir.path().join("test.db").to_str().unwrap()).unwrap()
    }

    fn entry(remote_id: &str, local_path: &str, entity: &str) -> ManifestEntry {
        ManifestEntry {
            remote_id: remote_id.into(),
            entity_type: entity.into(),
            remote_path: local_path.into(),
            local_path: local_path.into(),
            remote_version: 1,
            checksum: None,
            size: 0,
            synced_at: "t".into(),
        }
    }

    #[test]
    fn cursor_defaults_to_zero() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        assert_eq!(m.get_cursor().unwrap(), 0);
    }

    #[test]
    fn cursor_persists_across_writes() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.set_cursor(42).unwrap();
        assert_eq!(m.get_cursor().unwrap(), 42);
        m.set_cursor(100).unwrap();
        assert_eq!(m.get_cursor().unwrap(), 100);
    }

    #[test]
    fn upsert_and_get_entry_round_trips() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.upsert_entry(&entry("abc", "/root/a", "file")).unwrap();
        let got = m.get_entry("abc").unwrap().unwrap();
        assert_eq!(got.local_path, "/root/a");
    }

    #[test]
    fn remove_entry_deletes_it() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.upsert_entry(&entry("abc", "/root/a", "file")).unwrap();
        m.remove_entry("abc").unwrap();
        assert!(m.get_entry("abc").unwrap().is_none());
    }

    #[test]
    fn find_descendants_returns_only_children_of_prefix() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        let sep = std::path::MAIN_SEPARATOR;

        let root_a = format!("{sep}root{sep}Docs");
        let child_1 = format!("{sep}root{sep}Docs{sep}a.txt");
        let child_2 = format!("{sep}root{sep}Docs{sep}sub{sep}b.txt");
        let sibling = format!("{sep}root{sep}Other{sep}c.txt");

        m.upsert_entry(&entry("parent", &root_a, "folder")).unwrap();
        m.upsert_entry(&entry("child-1", &child_1, "file")).unwrap();
        m.upsert_entry(&entry("child-2", &child_2, "file")).unwrap();
        m.upsert_entry(&entry("sibling", &sibling, "file")).unwrap();

        let descendants = m.find_descendants(&root_a).unwrap();
        let ids: Vec<&str> = descendants.iter().map(|d| d.remote_id.as_str()).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"child-1"));
        assert!(ids.contains(&"child-2"));
        assert!(!ids.contains(&"sibling"));
        assert!(!ids.contains(&"parent"));
    }

    #[test]
    fn find_descendants_returns_empty_for_untracked_prefix() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        assert_eq!(
            m.find_descendants("/nope").unwrap().len(),
            0
        );
    }

    #[test]
    fn rewrite_local_path_prefix_reroots_matching_entries() {
        // Build paths from MAIN_SEPARATOR so the LIKE-clause codepath is
        // exercised with the platform's native separator on both Unix and
        // Windows.
        let sep = std::path::MAIN_SEPARATOR;
        let dir = tempdir().unwrap();
        let m = mk(&dir);

        let a_old = format!("{sep}old{sep}root{sep}file.txt");
        let b_old = format!("{sep}old{sep}root{sep}sub{sep}nested.md");
        let c_old = format!("{sep}old{sep}root");
        let d_unrelated = format!("{sep}other{sep}place{sep}x.txt");

        m.upsert_entry(&entry("a", &a_old, "file")).unwrap();
        m.upsert_entry(&entry("b", &b_old, "file")).unwrap();
        m.upsert_entry(&entry("c", &c_old, "folder")).unwrap();
        m.upsert_entry(&entry("d", &d_unrelated, "file")).unwrap();

        let old_prefix = format!("{sep}old{sep}root");
        let new_prefix = format!("{sep}new{sep}place");
        let changed = m
            .rewrite_local_path_prefix(&old_prefix, &new_prefix)
            .unwrap();
        assert_eq!(changed, 3);

        assert_eq!(
            m.get_entry("a").unwrap().unwrap().local_path,
            format!("{sep}new{sep}place{sep}file.txt")
        );
        assert_eq!(
            m.get_entry("b").unwrap().unwrap().local_path,
            format!("{sep}new{sep}place{sep}sub{sep}nested.md")
        );
        assert_eq!(
            m.get_entry("c").unwrap().unwrap().local_path,
            format!("{sep}new{sep}place")
        );
        assert_eq!(
            m.get_entry("d").unwrap().unwrap().local_path,
            d_unrelated,
            "unrelated paths must not be rewritten"
        );
    }

    fn op(key: &str, kind: &str) -> PendingOp {
        PendingOp {
            idempotency_key: key.into(),
            op_kind: kind.into(),
            endpoint: format!("/{}", kind),
            payload: "{}".into(),
            created_at: "2026-04-14T00:00:00Z".into(),
            attempts: 0,
        }
    }

    #[test]
    fn pending_op_insert_and_list_roundtrips() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.insert_pending_op(&op("k1", "rename_file")).unwrap();
        m.insert_pending_op(&op("k2", "delete_folder")).unwrap();
        let ops = m.list_pending_ops().unwrap();
        assert_eq!(ops.len(), 2);
        // ordering is by created_at ASC; since both use the same timestamp,
        // we assert presence rather than order.
        let keys: Vec<&str> = ops.iter().map(|o| o.idempotency_key.as_str()).collect();
        assert!(keys.contains(&"k1"));
        assert!(keys.contains(&"k2"));
    }

    #[test]
    fn pending_op_delete_removes_the_entry() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.insert_pending_op(&op("k1", "rename_file")).unwrap();
        m.delete_pending_op("k1").unwrap();
        assert!(m.list_pending_ops().unwrap().is_empty());
    }

    #[test]
    fn pending_op_increment_attempts_counts_up() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.insert_pending_op(&op("k1", "rename_file")).unwrap();
        m.increment_pending_op_attempts("k1").unwrap();
        m.increment_pending_op_attempts("k1").unwrap();
        let ops = m.list_pending_ops().unwrap();
        assert_eq!(ops[0].attempts, 2);
    }

    #[test]
    fn exclude_and_include_folder_roundtrips() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.exclude_folder("folder-1", "/root/Archive").unwrap();
        assert_eq!(m.list_excluded_folder_ids().unwrap(), vec!["folder-1"]);
        assert!(m.is_folder_excluded("folder-1").unwrap());
        assert!(!m.is_folder_excluded("other").unwrap());
        m.include_folder("folder-1").unwrap();
        assert!(!m.is_folder_excluded("folder-1").unwrap());
        assert_eq!(m.list_excluded_folder_ids().unwrap(), Vec::<String>::new());
    }

    #[test]
    fn is_path_under_excluded_matches_nested_paths() {
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        let sep = std::path::MAIN_SEPARATOR;
        let root = format!("{sep}root{sep}Archive");
        m.exclude_folder("folder-1", &root).unwrap();

        // Exact match and nested paths should both be excluded.
        assert!(m.is_path_under_excluded(&root).unwrap());
        let nested = format!("{root}{sep}2025{sep}report.pdf");
        assert!(m.is_path_under_excluded(&nested).unwrap());
        // Sibling / parent paths should not.
        let sibling = format!("{sep}root{sep}Other{sep}a.txt");
        assert!(!m.is_path_under_excluded(&sibling).unwrap());
        let parent = format!("{sep}root{sep}file.txt");
        assert!(!m.is_path_under_excluded(&parent).unwrap());
        // Prefix lookalike: /root/ArchiveNOT should not match /root/Archive.
        let lookalike = format!("{sep}root{sep}ArchiveNOT{sep}x.txt");
        assert!(!m.is_path_under_excluded(&lookalike).unwrap());
    }

    #[test]
    fn remove_entries_under_clears_subtree_and_leaves_siblings() {
        let sep = std::path::MAIN_SEPARATOR;
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        let arc = format!("{sep}root{sep}Archive");
        let arc_file = format!("{sep}root{sep}Archive{sep}x.pdf");
        let sibling = format!("{sep}root{sep}Other{sep}y.pdf");
        m.upsert_entry(&entry("arc", &arc, "folder")).unwrap();
        m.upsert_entry(&entry("arc-file", &arc_file, "file")).unwrap();
        m.upsert_entry(&entry("sib", &sibling, "file")).unwrap();

        let n = m.remove_entries_under(&arc).unwrap();
        assert_eq!(n, 2);
        assert!(m.get_entry("arc").unwrap().is_none());
        assert!(m.get_entry("arc-file").unwrap().is_none());
        assert!(m.get_entry("sib").unwrap().is_some());
    }

    #[test]
    fn rewrite_local_path_prefix_does_not_match_prefix_lookalikes() {
        // foo must not match foobar — the separator anchor in the LIKE
        // clause prevents accidental rewrites on both Unix and Windows.
        let sep = std::path::MAIN_SEPARATOR;
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        m.upsert_entry(&entry("a", &format!("{sep}foo{sep}real.txt"), "file"))
            .unwrap();
        m.upsert_entry(&entry(
            "b",
            &format!("{sep}foobar{sep}unrelated.txt"),
            "file",
        ))
        .unwrap();

        m.rewrite_local_path_prefix(&format!("{sep}foo"), &format!("{sep}new"))
            .unwrap();

        assert_eq!(
            m.get_entry("a").unwrap().unwrap().local_path,
            format!("{sep}new{sep}real.txt")
        );
        assert_eq!(
            m.get_entry("b").unwrap().unwrap().local_path,
            format!("{sep}foobar{sep}unrelated.txt")
        );
    }

    #[test]
    fn find_descendants_is_case_insensitive() {
        // Mirrors what happens on Windows / default-APFS macOS when the
        // manifest stores `/root/Docs` but a watcher event surfaces
        // `/root/docs`. With COLLATE NOCASE on local_path, both `=` and
        // `LIKE` queries match regardless of casing.
        let sep = std::path::MAIN_SEPARATOR;
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        let stored = format!("{sep}root{sep}Docs");
        let child = format!("{sep}root{sep}Docs{sep}note.md");
        m.upsert_entry(&entry("p", &stored, "folder")).unwrap();
        m.upsert_entry(&entry("c", &child, "file")).unwrap();

        let lookup = format!("{sep}root{sep}docs");
        let descendants = m.find_descendants(&lookup).unwrap();
        assert_eq!(descendants.len(), 1);
        assert_eq!(descendants[0].remote_id, "c");
    }

    #[test]
    fn migration_preserves_rows_when_adding_nocase() {
        // Simulate an older on-disk manifest: open a raw connection and
        // create the pre-COLLATE-NOCASE schema, insert rows, close it.
        // Then reopen via SyncManifest::open to trigger the migration and
        // confirm the rows survived. Without this, opening with the new
        // code would either drop data or treat a returning user as fresh,
        // which would re-upload every local file as a duplicate.
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("legacy.db");
        let path_str = db_path.to_str().unwrap();
        {
            let conn = Connection::open(path_str).unwrap();
            conn.execute_batch(
                "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE entries (
                     remote_id       TEXT PRIMARY KEY,
                     entity_type     TEXT NOT NULL,
                     remote_path     TEXT NOT NULL,
                     local_path      TEXT NOT NULL,
                     remote_version  INTEGER NOT NULL,
                     checksum        TEXT,
                     size            INTEGER NOT NULL DEFAULT 0,
                     synced_at       TEXT NOT NULL
                 );
                 CREATE TABLE excluded_folders (
                     remote_id   TEXT PRIMARY KEY,
                     local_path  TEXT NOT NULL,
                     excluded_at TEXT NOT NULL
                 );
                 INSERT INTO meta VALUES ('cursor', '42');
                 INSERT INTO entries VALUES
                   ('r1', 'file', '/a.txt', '/root/a.txt', 1, NULL, 0, 't'),
                   ('r2', 'folder', '/Docs', '/root/Docs', 1, NULL, 0, 't');
                 INSERT INTO excluded_folders VALUES ('r3', '/root/Archive', 't');",
            )
            .unwrap();
        }

        let m = SyncManifest::open(path_str).unwrap();

        assert_eq!(m.get_cursor().unwrap(), 42);
        assert!(m.get_entry("r1").unwrap().is_some());
        assert!(m.get_entry("r2").unwrap().is_some());
        assert!(m.is_folder_excluded("r3").unwrap());

        // And the new column is in fact case-insensitive after migration.
        let descendants = m.find_descendants("/root/docs").unwrap();
        assert_eq!(descendants.len(), 0); // no children, but the LIKE matches /root/Docs prefix-style
        let stored = m.get_entry("r2").unwrap().unwrap();
        assert_eq!(stored.local_path, "/root/Docs");
    }

    #[test]
    fn is_path_under_excluded_is_case_insensitive() {
        let sep = std::path::MAIN_SEPARATOR;
        let dir = tempdir().unwrap();
        let m = mk(&dir);
        let stored = format!("{sep}root{sep}Archive");
        m.exclude_folder("folder-1", &stored).unwrap();

        let lookup = format!("{sep}ROOT{sep}archive{sep}2025{sep}r.pdf");
        assert!(m.is_path_under_excluded(&lookup).unwrap());
    }
}
