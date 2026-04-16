import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Download Selfbox Desktop",
  description:
    "Native macOS and Windows apps that keep a folder on your computer in sync with a Selfbox workspace.",
};

// Re-fetch the GitHub Release at most once every 5 minutes. Same TTL as
// the updater manifest so they tend to refresh together.
export const revalidate = 300;

const REPO = process.env.SELFBOX_DESKTOP_RELEASES_REPO; // "owner/repo"

interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  html_url: string;
  published_at: string;
  assets: Asset[];
}

async function fetchLatestRelease(): Promise<Release | null> {
  if (!REPO) return null;
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        "User-Agent": "selfbox-download-page",
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    },
  );
  if (!res.ok) return null;
  const release = (await res.json()) as Release;
  if (!release.tag_name) return null;
  return release;
}

interface Variant {
  label: string;
  description: string;
  filenameMatch: (name: string) => boolean;
  /** Note rendered under the button (e.g. SmartScreen warning for Windows). */
  caveat?: string;
}

const VARIANTS: Variant[] = [
  {
    label: "macOS — Apple Silicon",
    description: "M1, M2, M3, M4",
    filenameMatch: (n) =>
      n.toLowerCase().endsWith(".dmg") && n.toLowerCase().includes("aarch64"),
  },
  {
    label: "macOS — Intel",
    description: "Pre-2020 Macs",
    filenameMatch: (n) =>
      n.toLowerCase().endsWith(".dmg") && n.toLowerCase().includes("x64"),
  },
  {
    label: "Windows",
    description: "Windows 10 and 11",
    // Prefer the .msi over the .exe — quieter install, easier uninstall.
    filenameMatch: (n) => n.toLowerCase().endsWith(".msi"),
    caveat:
      "Windows builds aren't code-signed yet. SmartScreen will warn on first launch — click \"More info → Run anyway\".",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DownloadPage() {
  const release = await fetchLatestRelease();

  if (!release) {
    return (
      <section className="pt-28 md:pt-36 pb-16">
        <div className="text-center">
          <h1 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight">
            Selfbox <em className="italic">for Desktop</em>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mt-6">
            Downloads aren't available yet — we're working on the first
            release. Check back soon, or follow along on{" "}
            <Link
              className="underline underline-offset-2"
              href="https://github.com/anthropics/claude-code/issues"
            >
              GitHub
            </Link>
            .
          </p>
        </div>
      </section>
    );
  }

  const version = release.tag_name.replace(/^desktop-v/, "");
  const downloads = VARIANTS.map((v) => ({
    ...v,
    asset: release.assets.find((a) => v.filenameMatch(a.name)) ?? null,
  }));

  return (
    <section className="pt-28 md:pt-36 pb-16">
      <div className="text-center max-w-2xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          v{version} · released {new Date(release.published_at).toLocaleDateString()}
        </p>
        <h1 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight font-normal mt-3">
          Selfbox <em className="italic">for Desktop</em>
        </h1>
        <p className="text-lg text-muted-foreground mt-6">
          A folder on your Mac or PC, kept continuously in sync with a Selfbox
          workspace. Drop files in, organize them, rename and move — every
          change propagates to the web in seconds, and changes from other
          devices flow back to your machine.
        </p>
      </div>

      <div className="mt-12 grid gap-4 max-w-2xl mx-auto md:grid-cols-3">
        {downloads.map((d) => (
          <DownloadCard key={d.label} variant={d} />
        ))}
      </div>

      <div className="mt-10 text-center text-sm text-muted-foreground">
        <Link
          href={release.html_url}
          className="underline underline-offset-2 hover:text-foreground"
        >
          Release notes & all assets
        </Link>
      </div>
    </section>
  );
}

function DownloadCard({
  variant,
}: {
  variant: Variant & { asset: Asset | null };
}) {
  const { label, description, asset, caveat } = variant;
  return (
    <div className="flex flex-col rounded-lg border border-foreground/10 bg-white p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground/80">{description}</p>

      {asset ? (
        <a
          href={asset.browser_download_url}
          className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary/80"
          download
        >
          <ArrowDown className="h-4 w-4" />
          Download
          <span className="font-normal text-primary-foreground/70">
            ({formatBytes(asset.size)})
          </span>
        </a>
      ) : (
        <p className="mt-4 inline-flex items-center justify-center rounded-full border border-foreground/10 px-4 py-2 font-mono text-sm text-muted-foreground">
          Not available in v{variant.label}
        </p>
      )}

      {caveat && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{caveat}</span>
        </p>
      )}
    </div>
  );
}
