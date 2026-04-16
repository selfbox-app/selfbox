use notify::event::{ModifyKind, RenameMode};
use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;

/// Watches the local sync folder for filesystem changes.
pub struct FsWatcher {
    _watcher: notify::RecommendedWatcher,
    rx: mpsc::Receiver<Result<Event, notify::Error>>,
}

impl FsWatcher {
    pub fn new(path: &Path) -> Result<Self, notify::Error> {
        let (tx, rx) = mpsc::channel();

        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })?;

        watcher.watch(path, RecursiveMode::Recursive)?;

        Ok(Self {
            _watcher: watcher,
            rx,
        })
    }

    /// Drain pending filesystem events.
    /// Returns coalesced events — deduplicates rapid changes to the same path.
    pub fn drain_events(&self) -> Vec<FsChange> {
        let mut changes = Vec::new();
        let mut seen = std::collections::HashSet::new();

        while let Ok(Ok(event)) = self.rx.try_recv() {
            for path in event.paths {
                let path_str = path.to_string_lossy().to_string();
                if seen.contains(&path_str) {
                    continue;
                }
                seen.insert(path_str.clone());

                let Some(kind) = classify(&event.kind, &path) else {
                    continue;
                };

                log::debug!(
                    "fs event: notify={:?} path={} → {:?}",
                    event.kind,
                    path_str,
                    kind
                );
                changes.push(FsChange {
                    path: path_str,
                    kind,
                });
            }
        }

        changes
    }
}

/// Translate a `notify` event kind for a given path into our coarse
/// `FsChangeKind`. Renames come through as `Modify(Name(..))` and arrive once
/// per side: the old path no longer exists (→ Deleted), the new one does
/// (→ Created). The engine's rename detector turns that pair back into a
/// single server-side rename.
///
/// macOS FSEvents often reports `Modify(Any)` for pure content edits, so for
/// non-rename modifies we trust `path.exists()`: present → Modified, absent →
/// Deleted (e.g. the file was deleted and its kind came through as Modify).
fn classify(kind: &EventKind, path: &Path) -> Option<FsChangeKind> {
    match kind {
        EventKind::Create(_) => Some(FsChangeKind::Created),
        EventKind::Remove(_) => Some(FsChangeKind::Deleted),
        EventKind::Modify(ModifyKind::Name(rename)) => Some(match rename {
            RenameMode::From => FsChangeKind::Deleted,
            RenameMode::To => FsChangeKind::Created,
            // Both / Any / Other: fall back to existence.
            _ => if path.exists() {
                FsChangeKind::Created
            } else {
                FsChangeKind::Deleted
            },
        }),
        EventKind::Modify(_) => Some(if path.exists() {
            FsChangeKind::Modified
        } else {
            FsChangeKind::Deleted
        }),
        _ => None,
    }
}

#[derive(Debug)]
pub struct FsChange {
    pub path: String,
    pub kind: FsChangeKind,
}

#[derive(Debug)]
pub enum FsChangeKind {
    Created,
    Modified,
    Deleted,
}
