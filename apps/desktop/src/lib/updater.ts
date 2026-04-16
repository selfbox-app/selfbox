// Thin wrapper around @tauri-apps/plugin-updater. The Status page polls
// `checkForUpdate` on mount and once per `CHECK_INTERVAL_MS`, surfaces
// the result via a small banner, and asks this module to install when
// the user clicks the banner.

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// 6 hours. The endpoint already caches at the edge, and we don't want
// to hammer it from every running client.
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface AvailableUpdate {
  version: string;
  notes: string;
}

/**
 * Returns a description of the pending update if one exists, or null
 * if the running app is current. Errors (no network, server down,
 * malformed manifest) are swallowed and logged — the user shouldn't
 * see a "couldn't check for updates" message in steady state.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    const update: Update | null = await check();
    if (!update) return null;
    return { version: update.version, notes: update.body ?? "" };
  } catch (err) {
    console.warn("[updater] check failed", err);
    return null;
  }
}

/**
 * Download + install the pending update, then relaunch. Caller is
 * responsible for guarding against concurrent invocations and
 * surfacing progress in the UI. Throws on failure so the UI can show
 * an error state.
 */
export async function installPendingUpdate(
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  const update = await check();
  if (!update) {
    // Race: caller saw an update earlier but it's gone now (rare —
    // someone yanked the release between check and install). Treat
    // as a no-op rather than an error.
    return;
  }

  let total: number | null = null;
  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
        break;
      case "Finished":
        onProgress?.(total ?? downloaded, total);
        break;
    }
  });

  await relaunch();
}
