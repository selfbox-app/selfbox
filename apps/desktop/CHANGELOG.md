# Selfbox Desktop Sync — Changelog

All notable changes to the desktop sync app live here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — Initial release

The first installable build. Pairs a workspace from selfbox.app with a
folder on your Mac or PC and keeps the two in sync continuously.

### Sync engine

- Two-way file and folder sync: uploads, downloads, renames, moves, and
  deletes propagate in both directions.
- Local filesystem watcher with rename detection (matches a delete + create
  by content checksum to preserve version history server-side).
- Conflict handling: if both sides edit the same file before sync, the
  local copy is preserved as a sibling `<name> (conflict from <device>).<ext>`.
- Idempotent server mutations + a local pending-ops journal so a crash or
  network drop mid-sync replays cleanly without duplicating work.
- Selective sync: exclude folders from local mirroring; included folders
  fetch their contents on demand.
- Case-insensitive `local_path` matching so case-only renames on Windows
  and default-APFS macOS don't look like delete + duplicate-upload.

### Account flows

- Device-flow sign-in via the web; access tokens auto-refresh in the
  background when they expire.
- Switch workspaces, change sync folder, sign out from the in-app
  Settings screen.

### UI

- Native macOS menu-bar icon (Selfbox mark, dark-mode aware).
- Tray menu: pause/resume sync, open sync folder, open web app.
- Status screen with workspace info, current sync state, and a live
  activity panel that shows uploads, downloads, renames, moves, and
  deletes as they happen.
- Conflict screen lists auto-resolved conflicts with paths.
- Launch-at-login support (off by default; toggled in Settings).

### Storage backends

- Direct upload to S3, R2, Vercel Blob, Railway Object Storage, and
  Selfbox local-disk backends — bytes route through whatever the
  workspace is configured to use, including BYOB.
- Per-workspace storage credentials are encrypted at rest with
  AES-256-GCM.
