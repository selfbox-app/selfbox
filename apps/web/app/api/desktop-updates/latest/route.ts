// Tauri auto-updater manifest endpoint.
//
// The desktop app's tauri.conf.json points at:
//   https://selfbox.app/api/desktop-updates/latest?platform={target}-{arch}&current_version={version}
//
// Tauri expands the templates before calling. This handler resolves the
// latest GitHub Release for the desktop repo, finds the bundle that
// matches the requested platform, fetches its .sig file, and returns the
// JSON shape the updater plugin expects:
//
//   { version, notes, pub_date, platforms: { "darwin-aarch64": { signature, url } } }
//
// On "no update" we return 204 — the updater plugin treats that as
// "you're current". Edge cache for 5 minutes so the GitHub API rate limit
// doesn't bite under load.

import { NextResponse } from "next/server";

export const revalidate = 300;

const REPO = process.env.SELFBOX_DESKTOP_RELEASES_REPO; // "owner/repo"

// Tauri's `{target}-{arch}` template emits these platform keys.
const BUNDLE_SUFFIX_BY_PLATFORM: Record<string, string> = {
  "darwin-aarch64": ".app.tar.gz", // unpacked .app for Apple Silicon
  "darwin-x86_64": ".app.tar.gz", // unpacked .app for Intel Mac
  "windows-x86_64": "x64-setup.nsis.zip",
};

// Pick the asset whose name matches both the architecture and the
// platform. We use bundle suffixes (.app.tar.gz, .nsis.zip) instead of
// the user-facing .dmg / .msi because those are the formats the updater
// can actually swap in place.
function pickAsset(
  assets: Array<{ name: string; browser_download_url: string }>,
  platform: string,
) {
  const suffix = BUNDLE_SUFFIX_BY_PLATFORM[platform];
  if (!suffix) return null;
  // Filter by suffix first, then by arch token. macOS bundles include
  // `aarch64` or `x64` in the filename; Windows bundles always carry x64.
  const archToken = platform.endsWith("aarch64") ? "aarch64" : "x64";
  return (
    assets.find(
      (a) =>
        a.name.endsWith(suffix) && a.name.toLowerCase().includes(archToken),
    ) ?? null
  );
}

interface GitHubRelease {
  tag_name: string;
  body: string | null;
  published_at: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

export async function GET(request: Request) {
  if (!REPO) {
    return NextResponse.json(
      { error: "SELFBOX_DESKTOP_RELEASES_REPO not configured" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const currentVersion = url.searchParams.get("current_version");

  if (!platform || !currentVersion) {
    return NextResponse.json(
      { error: "missing platform or current_version" },
      { status: 400 },
    );
  }

  // Latest published, non-draft, non-prerelease.
  const release: GitHubRelease | { message: string } = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        "User-Agent": "selfbox-updater",
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    },
  ).then((r) => r.json());

  if (!("tag_name" in release)) {
    return NextResponse.json({ error: "no published release" }, { status: 404 });
  }

  const tagVersion = release.tag_name.replace(/^desktop-v/, "");
  if (tagVersion === currentVersion) {
    return new NextResponse(null, { status: 204 });
  }

  const asset = pickAsset(release.assets, platform);
  if (!asset) {
    return NextResponse.json(
      { error: `no asset for platform ${platform}` },
      { status: 404 },
    );
  }

  // Tauri signs the bundle with the updater key; the .sig sits next to
  // the asset under the same name + ".sig". Fetching it eagerly so the
  // updater client gets one round-trip to the manifest, not two.
  const sigAsset = release.assets.find((a) => a.name === `${asset.name}.sig`);
  if (!sigAsset) {
    return NextResponse.json(
      { error: `no .sig file for asset ${asset.name}` },
      { status: 500 },
    );
  }
  const signature = await fetch(sigAsset.browser_download_url).then((r) =>
    r.text(),
  );

  return NextResponse.json({
    version: tagVersion,
    notes: release.body ?? "",
    pub_date: release.published_at,
    platforms: {
      [platform]: {
        signature,
        url: asset.browser_download_url,
      },
    },
  });
}
