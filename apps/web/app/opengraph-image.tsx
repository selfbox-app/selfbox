import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Selfbox — Open-source file storage platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRIMARY = "#f97316";

export default async function Image() {
  const { createRequire } = await import(
    /* webpackIgnore: true */ "node:module"
  );
  const nodeRequire = createRequire(join(process.cwd(), "package.json"));
  const geistDir = join(
    nodeRequire.resolve("geist/font/sans"),
    "../../dist/fonts",
  );
  const [geistRegular, geistMedium, geistMonoBold] = await Promise.all([
    readFile(join(geistDir, "geist-sans/Geist-Regular.ttf")),
    readFile(join(geistDir, "geist-sans/Geist-Medium.ttf")),
    readFile(join(geistDir, "geist-mono/GeistMono-Bold.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FAFAFA",
        padding: "48px 56px",
        fontFamily: "Geist",
      }}
    >
      {/* Top bar — logo + badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={56}
          height={56}
          viewBox="0 0 100 100"
        >
          <path
            d="M47.5435 64.0716L31.1272 33.7255C19.3719 52.8378 26.5322 41.1936 21.3381 49.6405C25.9001 58.0734 30.4642 66.5052 35.0262 74.9381L63.7768 75.739L65.263 73.3212C46.4936 38.6253 54.394 53.1923 42.0049 30.2906L62.1574 30.8466L65.5921 37.1957C61.272 37.0717 56.9519 36.9421 52.6321 36.8237C58.1013 46.9339 63.573 57.0485 69.0471 67.1676C76.4266 55.1693 78.3928 51.972 78.8373 51.2491C74.2732 42.8174 69.7102 34.3879 65.146 25.9562L36.3976 25.1541L34.9114 27.5719C53.676 62.2589 45.7913 47.7207 58.1696 70.6025L38.0242 70.0598L34.5908 63.7129L47.5447 64.0738L47.5435 64.0716Z"
            fill="#141414"
          />
        </svg>
        {/* Open source badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#999999",
            fontFamily: "Geist Mono",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            border: "1px solid #E5E5E5",
            padding: "5px 12px",
          }}
        >
          Open Source
        </span>
      </div>

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          gap: 48,
          marginTop: -48,
        }}
      >
        {/* Left — headline + description */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 500,
              lineHeight: 1.05,
              color: "#141414",
              fontFamily: "Geist",
              letterSpacing: "-0.035em",
            }}
          >
            Your Files, Your Cloud
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#737373",
              lineHeight: 1.5,
              fontFamily: "Geist",
            }}
          >
            The open-source file storage platform you can self-host. Upload,
            organize, and share files — fully under your control.
          </div>
        </div>

        {/* Right — file cards */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 380,
            flexShrink: 0,
            gap: 0,
          }}
        >
          {/* File cards grid */}
          <div style={{ display: "flex", gap: 0, border: "1px solid #E5E5E5" }}>
            {fileCard("Documents", "128", "files", "2.4 GB")}
            {fileCard("Images", "847", "files", "12.1 GB")}
          </div>
          <div
            style={{
              display: "flex",
              gap: 0,
              borderLeft: "1px solid #E5E5E5",
              borderRight: "1px solid #E5E5E5",
              borderBottom: "1px solid #E5E5E5",
            }}
          >
            {fileCard("Projects", "24", "folders", "8.7 GB")}
            {fileCard("Shared", "16", "links", "Active")}
          </div>
          {/* Storage bar */}
          {storageBar(23.2, 50)}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "#999999",
            fontFamily: "Geist Mono",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          selfbox
        </span>
        <div style={{ display: "flex", gap: 16 }}>
          {["FILES", "SHARING", "UPLOADS", "TERMINAL"].map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#999999",
                fontFamily: "Geist Mono",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Geist",
          data: geistRegular,
          style: "normal" as const,
          weight: 400 as const,
        },
        {
          name: "Geist",
          data: geistMedium,
          style: "normal" as const,
          weight: 500 as const,
        },
        {
          name: "Geist Mono",
          data: geistMonoBold,
          style: "normal" as const,
          weight: 700 as const,
        },
      ],
    },
  );
}

function storageBar(used: number, total: number) {
  const pct = (used / total) * 100;
  const barWidth = 380;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E5",
        borderTop: "none",
        padding: "14px 16px",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#999999",
            fontFamily: "Geist Mono",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Storage
        </span>
        <span
          style={{
            fontSize: 9,
            color: "#999999",
            fontFamily: "Geist Mono",
            letterSpacing: "0.04em",
          }}
        >
          {used} GB / {total} GB
        </span>
      </div>
      <div
        style={{
          display: "flex",
          width: barWidth - 32,
          height: 6,
          backgroundColor: "#F0F0F0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: PRIMARY,
          }}
        />
      </div>
    </div>
  );
}

function fileCard(label: string, count: string, unit: string, size: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "14px 16px",
        backgroundColor: "#FFFFFF",
        borderRight: "1px solid #E5E5E5",
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: "#999999",
          fontFamily: "Geist Mono",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: "#141414",
            fontFamily: "Geist",
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {count}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "#999999",
            fontFamily: "Geist Mono",
          }}
        >
          {unit}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginTop: 2,
        }}
      >
        <div
          style={{
            width: 5,
            height: 5,
            backgroundColor: PRIMARY,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: PRIMARY,
            fontFamily: "Geist Mono",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {size}
        </span>
      </div>
    </div>
  );
}
