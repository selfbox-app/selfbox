"use client";

import { Link, Shield, Users, Timer, Copy, ChevronDown, FileText, Lock } from "lucide-react";
import { ProductSectionLayout } from "../_components/product-section-layout";
import { cn } from "@/lib/utils";

interface ProductTab {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const tabs: ProductTab[] = [
  {
    icon: Link,
    title: "Shared Links",
    description:
      "Generate encrypted share links with one click. Recipients don't need an account to download.",
  },
  {
    icon: Shield,
    title: "Access Controls",
    description:
      "Set view-only, download, or edit permissions per file. Revoke access instantly.",
  },
  {
    icon: Users,
    title: "Collaboration",
    description:
      "Shared folders for your team. Real-time updates, comments, and activity feeds.",
  },
  {
    icon: Timer,
    title: "Expiring Links",
    description:
      "Set links to expire after a time limit or download count. Perfect for sensitive deliverables.",
  },
];

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <div
      className={cn(
        "w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-mono font-medium text-muted-foreground shrink-0",
        className
      )}
    >
      {initials}
    </div>
  );
}

function ShareLinksVisual() {
  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      {/* File row */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-9 h-9 rounded bg-red-50 flex items-center justify-center">
          <FileText className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">Q1-Report.pdf</p>
          <p className="text-xs text-muted-foreground">2.4 MB</p>
        </div>
        <div className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-mono font-medium">
          Share
        </div>
      </div>

      {/* Share popover */}
      <div className="pt-4 space-y-3">
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          Share link
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-muted/50 rounded px-3 py-2 text-xs text-muted-foreground font-mono truncate border border-border">
            https://selfbox.app/s/x8k2m...
          </div>
          <button
            type="button"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded bg-muted hover:bg-muted/80 text-xs font-mono font-medium text-foreground transition-colors border border-border"
          >
            <Copy className="w-3 h-3" />
            Copy link
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="w-3 h-3" />
          <span>End-to-end encrypted</span>
        </div>
      </div>
    </div>
  );
}

function AccessControlsVisual() {
  const users = [
    { initials: "MC", name: "Maya Chen", permission: "Can edit" },
    { initials: "JO", name: "James O.", permission: "Can view" },
    { initials: "✦", name: "Anyone with link", permission: "Can download" },
  ];

  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      {/* File name header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Q1-Report.pdf</p>
      </div>

      {/* Permissions label */}
      <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground pt-3 pb-2">
        Permissions
      </p>

      {/* User rows */}
      <div className="space-y-0">
        {users.map((user) => (
          <div
            key={user.name}
            className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0"
          >
            <Avatar initials={user.initials} />
            <p className="flex-1 text-sm text-foreground truncate">{user.name}</p>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-border">
              {user.permission}
              <ChevronDown className="w-3 h-3" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollaborationVisual() {
  const activity = [
    { initials: "SL", name: "Sophie", action: "added", file: "design-v3.fig", time: "2m ago" },
    { initials: "JO", name: "James", action: "commented on", file: "brief.md", time: "15m ago" },
    { initials: "MC", name: "Maya", action: "uploaded", file: "budget.xlsx", time: "1h ago" },
  ];

  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      {/* Folder header */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <div className="w-5 h-5 rounded bg-blue-50 flex items-center justify-center">
          <Users className="w-3 h-3 text-blue-500" />
        </div>
        <p className="text-sm font-medium text-foreground">Project Alpha</p>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
          Shared
        </span>
      </div>

      {/* Activity label */}
      <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground pt-3 pb-2">
        Activity
      </p>

      {/* Activity feed */}
      <div className="space-y-0">
        {activity.map((item) => (
          <div
            key={item.file}
            className="flex items-start gap-3 py-2.5 border-b border-border last:border-b-0"
          >
            <Avatar initials={item.initials} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">
                <span className="font-medium">{item.name}</span>{" "}
                <span className="text-muted-foreground">{item.action}</span>{" "}
                <span className="font-mono text-xs">{item.file}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpiringLinksVisual() {
  return (
    <div className="bg-white rounded-lg border border-border p-4 w-full max-w-sm">
      {/* Header */}
      <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground pb-3">
        Link settings
      </p>

      {/* Link URL field */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-mono text-muted-foreground mb-1 block">Link URL</label>
          <div className="bg-muted/50 rounded px-3 py-2 text-xs text-muted-foreground font-mono truncate border border-border">
            https://selfbox.app/s/x8k2m...
          </div>
        </div>

        {/* Expires in */}
        <div>
          <label className="text-[11px] font-mono text-muted-foreground mb-1 block">Expires in</label>
          <div className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-xs font-mono text-foreground border border-border">
            <span>7 days</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>

        {/* Max downloads */}
        <div>
          <label className="text-[11px] font-mono text-muted-foreground mb-1 block">Max downloads</label>
          <div className="bg-muted/50 rounded px-3 py-2 text-xs font-mono text-foreground border border-border">
            10
          </div>
        </div>

        {/* Password protect toggle */}
        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-mono text-foreground">Password protect</span>
          <div className="w-8 h-[18px] rounded-full bg-primary relative">
            <div className="absolute right-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
          </div>
        </div>

        {/* Create Link button */}
        <button
          type="button"
          className="w-full py-2 rounded bg-primary text-primary-foreground text-xs font-mono font-medium text-center"
        >
          Create Link
        </button>
      </div>
    </div>
  );
}

function renderVisual(activeTab: number): React.ReactNode {
  switch (activeTab) {
    case 0:
      return <ShareLinksVisual />;
    case 1:
      return <AccessControlsVisual />;
    case 2:
      return <CollaborationVisual />;
    case 3:
      return <ExpiringLinksVisual />;
    default:
      return null;
  }
}

export function ProductSharingSection() {
  return (
    <ProductSectionLayout
      number="#03"
      label="Secure Sharing"
      heading="Share files without compromise."
      subtitle="Generate secure links, set permissions, and collaborate — all with end-to-end encryption."
      tabs={tabs}
      ctaLabel="All About Secure Sharing"
      ctaHref="#"
      renderVisual={renderVisual}
    />
  );
}
