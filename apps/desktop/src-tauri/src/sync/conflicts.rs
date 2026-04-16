use std::path::{Path, PathBuf};

use chrono::Utc;

/// When both local and remote changed the same file since the last common
/// version, keep the remote file in place and write the local copy as a
/// conflict file.
///
/// Pattern: `filename (conflict from <device> <timestamp>).ext`
pub fn conflict_filename(original: &str, device_name: &str) -> String {
    let timestamp = Utc::now().format("%Y-%m-%d %H%M%S");

    match original.rsplit_once('.') {
        Some((stem, ext)) => {
            format!("{stem} (conflict from {device_name} {timestamp}).{ext}")
        }
        None => {
            format!("{original} (conflict from {device_name} {timestamp})")
        }
    }
}

/// Rename `local_path` to a sibling conflict file (`filename (conflict from
/// <device> <timestamp>).ext`). If that sibling already exists (two conflicts
/// generated inside the same second), append `-2`, `-3`, … to the stem.
///
/// After this returns, the original path no longer exists on disk — the caller
/// is expected to download the authoritative remote copy over it.
pub fn write_conflict_copy(
    local_path: &Path,
    device_name: &str,
) -> std::io::Result<PathBuf> {
    let file_name = local_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("invalid file name: {local_path:?}"),
            )
        })?;

    let parent = local_path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("no parent dir: {local_path:?}"),
        )
    })?;

    let base = conflict_filename(file_name, device_name);
    let mut candidate = parent.join(&base);

    let mut n = 2u32;
    while candidate.exists() {
        candidate = parent.join(disambiguate(&base, n));
        n += 1;
    }

    std::fs::rename(local_path, &candidate)?;
    Ok(candidate)
}

/// Insert `-N` before the file extension. `"a (conflict from X 2026).pdf"`
/// becomes `"a (conflict from X 2026)-2.pdf"`.
fn disambiguate(name: &str, n: u32) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) => format!("{stem}-{n}.{ext}"),
        None => format!("{name}-{n}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_conflict_with_extension() {
        let name = conflict_filename("report.pdf", "MacBook");
        assert!(name.starts_with("report (conflict from MacBook"));
        assert!(name.ends_with(".pdf"));
    }

    #[test]
    fn test_conflict_without_extension() {
        let name = conflict_filename("Makefile", "MacBook");
        assert!(name.starts_with("Makefile (conflict from MacBook"));
        assert!(!name.contains('.'));
    }

    #[test]
    fn write_conflict_copy_renames_to_sibling() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("report.pdf");
        std::fs::write(&path, b"local bytes").unwrap();

        let out = write_conflict_copy(&path, "MacBook").unwrap();

        assert!(!path.exists(), "original should have been renamed");
        assert!(out.exists(), "conflict file should exist");
        assert_eq!(out.parent(), Some(dir.path()));
        let name = out.file_name().unwrap().to_string_lossy();
        assert!(name.starts_with("report (conflict from MacBook"));
        assert!(name.ends_with(".pdf"));
        assert_eq!(std::fs::read(&out).unwrap(), b"local bytes");
    }

    #[test]
    fn write_conflict_copy_disambiguates_on_collision() {
        let dir = tempdir().unwrap();

        // Pre-create a file at the exact name conflict_filename will generate.
        let target = dir.path().join("a.txt");
        std::fs::write(&target, b"one").unwrap();
        let collision = dir.path().join(conflict_filename("a.txt", "dev"));
        std::fs::write(&collision, b"previous conflict").unwrap();

        let out = write_conflict_copy(&target, "dev").unwrap();

        let name = out.file_name().unwrap().to_string_lossy();
        assert!(name.contains("-2"), "expected -2 suffix, got {name}");
        assert!(name.ends_with(".txt"));
        assert!(collision.exists(), "previous conflict must not be clobbered");
        assert_eq!(std::fs::read(&collision).unwrap(), b"previous conflict");
        assert_eq!(std::fs::read(&out).unwrap(), b"one");
    }

    #[test]
    fn disambiguate_respects_extension() {
        assert_eq!(disambiguate("foo.txt", 2), "foo-2.txt");
        assert_eq!(disambiguate("foo", 3), "foo-3");
        assert_eq!(
            disambiguate("a (conflict from X 2026).pdf", 2),
            "a (conflict from X 2026)-2.pdf"
        );
    }
}
