"use client";

import {
  Monitor,
  Smartphone,
  History,
  WifiOff,
  CheckCircle,
  CloudOff,
  Pin,
  FileText,
  Image,
  Music,
  FolderOpen,
} from "lucide-react";
import { ProductSectionLayout } from "../_components/product-section-layout";

interface ProductTab {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const tabs: ProductTab[] = [
  {
    icon: Monitor,
    title: "Desktop App",
    description:
      "Native apps for macOS, Windows, and Linux. Drag-and-drop files, background sync, system tray integration.",
  },
  {
    icon: Smartphone,
    title: "Mobile App",
    description:
      "iOS and Android apps with automatic photo backup, offline access, and share sheet integration.",
  },
  {
    icon: History,
    title: "Version History",
    description:
      "Every edit creates a version. Restore any previous version with one click. Never lose work again.",
  },
  {
    icon: WifiOff,
    title: "Offline Access",
    description:
      "Pin files and folders for offline use. Changes sync automatically when you reconnect.",
  },
];

function DesktopVisual() {
  const files = [
    { name: "design-v3.fig", size: "156 MB", icon: FileText },
    { name: "photos-vacation", size: "2.4 GB", icon: FolderOpen },
    { name: "presentation.pdf", size: "12 MB", icon: FileText },
    { name: "song-draft.mp3", size: "8.2 MB", icon: Music },
  ];

  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      {/* Title bar with traffic lights */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <span className="font-mono text-xs text-muted-foreground ml-2">
          Selfbox
        </span>
      </div>

      {/* Sidebar + file list */}
      <div className="flex gap-3">
        {/* Mini sidebar */}
        <div className="w-24 shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-mono text-foreground">
            <CheckCircle className="w-3 h-3 text-green-500" />
            All Files
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Recent
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <CheckCircle className="w-3 h-3 text-green-500" />
            Shared
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 space-y-2">
          {files.map((file) => {
            const Icon = file.icon;
            return (
              <div
                key={file.name}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-mono truncate">
                    {file.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-green-600 bg-green-50 px-1.5 py-0.5 rounded shrink-0 ml-2">
                  Synced
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileVisual() {
  const colors = [
    "bg-sky-200",
    "bg-amber-200",
    "bg-rose-200",
    "bg-emerald-200",
    "bg-violet-200",
    "bg-orange-200",
    "bg-teal-200",
    "bg-pink-200",
    "bg-indigo-200",
  ];

  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-[200px] mx-auto">
      {/* Phone frame */}
      <div className="bg-white rounded-2xl border-2 border-border overflow-hidden">
        {/* Status bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30">
          <span className="text-[9px] font-mono text-muted-foreground">
            9:41
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">
            ●●●
          </span>
        </div>

        {/* Backed up indicator */}
        <div className="flex items-center justify-center gap-1 py-2 bg-green-50">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-[10px] font-mono text-green-700">
            Backed up
          </span>
        </div>

        {/* Photo grid */}
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {colors.map((color, i) => (
            <div key={i} className={`${color} aspect-square`} />
          ))}
        </div>

        {/* Bottom nav hint */}
        <div className="h-4 bg-muted/20 flex items-center justify-center">
          <div className="w-8 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function VersionHistoryVisual() {
  const versions = [
    { version: "v3", date: "Apr 9, 10:24 AM", size: "156 MB" },
    { version: "v2", date: "Apr 8, 3:15 PM", size: "148 MB" },
    { version: "v1", date: "Apr 7, 9:00 AM", size: "142 MB" },
  ];

  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      <p className="font-mono text-xs text-muted-foreground mb-4">
        design-v3.fig
      </p>

      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-4">
          {versions.map((v) => (
            <div key={v.version} className="flex items-start gap-3 relative">
              {/* Timeline dot */}
              <div className="w-3.5 h-3.5 rounded-full border-2 border-primary bg-white shrink-0 mt-0.5 z-10" />

              <div className="flex-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium">
                    {v.version}{" "}
                    <span className="text-muted-foreground font-normal">
                      — {v.date}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.size}
                  </p>
                </div>
                <button
                  type="button"
                  className="font-mono text-xs text-primary hover:text-primary/80 border border-border rounded px-2 py-1 shrink-0 transition-colors"
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OfflineVisual() {
  const offlineFiles = [
    { name: "contracts-2024.pdf", icon: FileText },
    { name: "vacation-photos", icon: Image },
    { name: "project-proposal.docx", icon: FileText },
  ];

  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      {/* Device + cloud icon */}
      <div className="flex items-center justify-center gap-3 mb-5">
        <Monitor className="w-8 h-8 text-muted-foreground" />
        <CloudOff className="w-6 h-6 text-muted-foreground/60" />
      </div>

      {/* Offline files */}
      <div className="space-y-2">
        {offlineFiles.map((file) => {
          const Icon = file.icon;
          return (
            <div
              key={file.name}
              className="flex items-center justify-between py-2 px-3 rounded border border-border bg-muted/20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono truncate">{file.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Pin className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-mono text-primary">
                  Available offline
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderVisual(activeTab: number): React.ReactNode {
  switch (activeTab) {
    case 0:
      return <DesktopVisual />;
    case 1:
      return <MobileVisual />;
    case 2:
      return <VersionHistoryVisual />;
    case 3:
      return <OfflineVisual />;
    default:
      return null;
  }
}

export function ProductSyncSection() {
  return (
    <ProductSectionLayout
      number="#02"
      label="Cross-Device Sync"
      heading="Your files, everywhere you are."
      subtitle="Instant sync across every device. Work offline, reconnect seamlessly."
      tabs={tabs}
      ctaLabel="All About Cross-Device Sync"
      ctaHref="#"
      renderVisual={renderVisual}
    />
  );
}
