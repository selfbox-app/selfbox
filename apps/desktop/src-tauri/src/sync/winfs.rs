//! Cross-platform filesystem name mitigations.
//!
//! Windows rejects several characters that are legal on macOS/Linux, plus a
//! handful of DOS-era reserved basenames. A server that grew up on a POSIX
//! filesystem can happily store files like `8:30 meeting.md` or `aux.log` —
//! trying to materialize those verbatim on Windows fails.
//!
//! The policy here is conservative: map each invalid character to `_` and
//! suffix reserved basenames with `_`. We deliberately avoid anything more
//! clever (translitration, zero-width spaces) because it would make the
//! local path diverge further from the server name and confuse the user.
//!
//! This module is only consulted when writing to disk — manifest entries
//! still carry the server's name in `remote_path` so round-tripping is
//! possible.

/// Characters Windows rejects in filenames.
/// <https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file>
const WINDOWS_INVALID: &[char] = &['<', '>', ':', '"', '|', '?', '*'];

/// Reserved DOS-era basenames. Match is case-insensitive and applies to
/// both the bare name and `name.ext`.
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5",
    "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5",
    "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Return a version of `name` that is valid on the running platform's
/// filesystem. On non-Windows targets this is a near no-op — we only strip
/// NUL bytes (which every POSIX filesystem rejects too).
pub fn sanitize_for_local_fs(name: &str) -> String {
    #[cfg(windows)]
    {
        sanitize_for_windows(name)
    }
    #[cfg(not(windows))]
    {
        // NUL byte is illegal in POSIX paths. Strip rather than replace
        // so the visible name doesn't gain characters unexpectedly.
        name.replace('\0', "")
    }
}

/// Exposed for testing on non-Windows hosts.
pub fn sanitize_for_windows(name: &str) -> String {
    let mut out: String = name
        .chars()
        .map(|c| {
            if WINDOWS_INVALID.contains(&c) || (c as u32) < 0x20 {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Windows also trims trailing dots and spaces.
    while out.ends_with('.') || out.ends_with(' ') {
        out.pop();
    }

    // Reserved names are compared case-insensitively against the stem
    // (everything before the first dot).
    let stem_end = out.find('.').unwrap_or(out.len());
    let stem_upper: String = out[..stem_end].to_uppercase();
    if WINDOWS_RESERVED.iter().any(|r| *r == stem_upper) {
        // Append `_` to the stem so `CON.log` becomes `CON_.log`.
        out.insert(stem_end, '_');
    }

    if out.is_empty() {
        out.push('_');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::sanitize_for_windows;

    #[test]
    fn replaces_invalid_characters() {
        assert_eq!(sanitize_for_windows("8:30 meeting.md"), "8_30 meeting.md");
        assert_eq!(sanitize_for_windows("a<b>c|d?e*f\".txt"), "a_b_c_d_e_f_.txt");
    }

    #[test]
    fn strips_trailing_dots_and_spaces() {
        assert_eq!(sanitize_for_windows("name."), "name");
        assert_eq!(sanitize_for_windows("name   "), "name");
        assert_eq!(sanitize_for_windows("name. . "), "name");
    }

    #[test]
    fn suffixes_reserved_basenames() {
        assert_eq!(sanitize_for_windows("CON"), "CON_");
        assert_eq!(sanitize_for_windows("con.log"), "con_.log");
        assert_eq!(sanitize_for_windows("LPT1.txt"), "LPT1_.txt");
        assert_eq!(sanitize_for_windows("aux"), "aux_");
    }

    #[test]
    fn leaves_valid_names_alone() {
        assert_eq!(sanitize_for_windows("report.pdf"), "report.pdf");
        assert_eq!(
            sanitize_for_windows("Screenshot 2026-04-09 at 1.49.03 pm.png"),
            "Screenshot 2026-04-09 at 1.49.03 pm.png"
        );
    }

    #[test]
    fn empty_or_all_invalid_becomes_underscore() {
        assert_eq!(sanitize_for_windows(""), "_");
        // `...` trims to empty then becomes `_`.
        assert_eq!(sanitize_for_windows("..."), "_");
    }

    #[test]
    fn non_reserved_names_with_reserved_substring_are_unchanged() {
        // "console" contains "CON" but isn't the reserved "CON".
        assert_eq!(sanitize_for_windows("console.log"), "console.log");
        assert_eq!(sanitize_for_windows("aux-log.txt"), "aux-log.txt");
    }

    #[test]
    fn control_chars_are_replaced() {
        let input = "a\x01b\x1fc.txt";
        assert_eq!(sanitize_for_windows(input), "a_b_c.txt");
    }
}
