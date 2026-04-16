"use client";

import {
  FolderTree,
  Search,
  Lock,
  EyeOff,
  Folder,
  FileText,
  Image,
  ChevronRight,
  Shield,
  ArrowRight,
  Server,
  Monitor,
} from "lucide-react";
import { ProductSectionLayout } from "../_components/product-section-layout";

interface ProductTab {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

const tabs: ProductTab[] = [
  {
    icon: FolderTree,
    title: "File Organization",
    description:
      "Organize files in nested folders with tags, favorites, and smart filters. Find anything instantly.",
  },
  {
    icon: Search,
    title: "Full-Text Search",
    description:
      "Search across file names, contents, and metadata. Results in milliseconds, all encrypted.",
  },
  {
    icon: Lock,
    title: "E2E Encryption",
    description:
      "Every file is encrypted before it leaves your device. AES-256-GCM with client-side key management.",
  },
  {
    icon: EyeOff,
    title: "Zero-Knowledge",
    description:
      "We never see your encryption keys. Your data is private by architecture, not just policy.",
  },
];

function FileOrganizationVisual() {
  return (
    <div className="w-full max-w-sm bg-white rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Folder className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-mono text-muted-foreground">My Files</span>
      </div>

      {/* Sidebar + Content */}
      <div className="flex">
        {/* Sidebar */}
        <div className="w-36 border-r border-border p-2 space-y-0.5">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 text-xs font-medium">
            <Folder className="w-3 h-3 text-primary" />
            <span>Documents</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground pl-6">
            <ChevronRight className="w-2.5 h-2.5" />
            <span>Contracts</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground pl-6">
            <ChevronRight className="w-2.5 h-2.5" />
            <span>Invoices</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground">
            <Folder className="w-3 h-3" />
            <span>Photos</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground pl-6">
            <ChevronRight className="w-2.5 h-2.5" />
            <span>2026</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground">
            <Folder className="w-3 h-3" />
            <span>Projects</span>
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 p-2 space-y-0.5">
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
            <FileText className="w-3 h-3 text-blue-500" />
            <span className="truncate">NDA_2026.pdf</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-muted/40 text-xs">
            <FileText className="w-3 h-3 text-blue-500" />
            <span className="truncate">Service_Agreement.pdf</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
            <Image className="w-3 h-3 text-emerald-500" />
            <span className="truncate">photo_001.jpg</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
            <FileText className="w-3 h-3 text-primary" />
            <span className="truncate">Q1_Budget.xlsx</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/50 text-xs">
            <FileText className="w-3 h-3 text-blue-500" />
            <span className="truncate">Project_Brief.docx</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchVisual() {
  return (
    <div className="w-full max-w-sm bg-white rounded-lg border border-border overflow-hidden">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-sm">quarterly report</span>
        <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          3 results
        </span>
      </div>

      {/* Results */}
      <div className="divide-y divide-border">
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="text-xs font-medium">Q4_Quarterly_Report.pdf</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 pl-[18px]">
            Documents / Reports / 2025
          </p>
          <p className="text-[10px] mt-1 pl-[18px]">
            ...overall revenue grew 23% in the{" "}
            <span className="bg-yellow-100 px-0.5 rounded font-medium">
              quarterly report
            </span>{" "}
            period...
          </p>
        </div>

        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-primary shrink-0" />
            <span className="text-xs font-medium">Quarterly_Report_Q1.xlsx</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 pl-[18px]">
            Documents / Finance
          </p>
          <p className="text-[10px] mt-1 pl-[18px]">
            ...see attached{" "}
            <span className="bg-yellow-100 px-0.5 rounded font-medium">
              quarterly report
            </span>{" "}
            spreadsheet for details...
          </p>
        </div>

        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="text-xs font-medium">Board_Meeting_Notes.docx</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 pl-[18px]">
            Documents / Meetings
          </p>
          <p className="text-[10px] mt-1 pl-[18px]">
            ...discussed the{" "}
            <span className="bg-yellow-100 px-0.5 rounded font-medium">
              quarterly report
            </span>{" "}
            findings with the board...
          </p>
        </div>
      </div>
    </div>
  );
}

function EncryptionVisual() {
  return (
    <div className="w-full max-w-sm bg-white rounded-lg border border-border p-5">
      {/* Encryption flow */}
      <div className="flex items-center justify-between gap-3">
        {/* Original file */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-12 h-14 rounded border border-border flex items-center justify-center bg-muted/30">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            report.pdf
          </span>
        </div>

        {/* Arrow */}
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

        {/* Lock */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-12 h-14 rounded border border-primary/30 flex items-center justify-center bg-primary/5">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            AES-256
          </span>
        </div>

        {/* Arrow */}
        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

        {/* Encrypted block */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-12 h-14 rounded border border-emerald-300 flex items-center justify-center bg-emerald-50">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            encrypted
          </span>
        </div>
      </div>

      {/* Encrypted badge */}
      <div className="mt-4 flex justify-center">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-mono font-medium text-emerald-700">
          <Lock className="w-2.5 h-2.5" />
          Encrypted before upload
        </span>
      </div>

      {/* Encrypted payload preview */}
      <div className="mt-3 rounded bg-muted/40 border border-border p-2.5 font-mono text-[10px] text-muted-foreground leading-relaxed overflow-hidden">
        <span className="text-emerald-600">{"{"}</span>
        <br />
        &nbsp;&nbsp;
        <span className="text-muted-foreground/70">&quot;cipher&quot;</span>:{" "}
        <span className="text-blue-600">&quot;aes-256-gcm&quot;</span>,
        <br />
        &nbsp;&nbsp;
        <span className="text-muted-foreground/70">&quot;data&quot;</span>:{" "}
        <span className="text-primary">&quot;x4kF9...mQ2w=&quot;</span>,
        <br />
        &nbsp;&nbsp;
        <span className="text-muted-foreground/70">&quot;iv&quot;</span>:{" "}
        <span className="text-primary">&quot;a1b2c3...&quot;</span>
        <br />
        <span className="text-emerald-600">{"}"}</span>
      </div>
    </div>
  );
}

function ZeroKnowledgeVisual() {
  return (
    <div className="w-full max-w-sm bg-white rounded-lg border border-border p-5">
      {/* Diagram */}
      <div className="flex items-stretch justify-between gap-2">
        {/* Your Device */}
        <div className="flex-1 rounded border border-border p-3 flex flex-col items-center gap-2 bg-muted/20">
          <Monitor className="w-5 h-5 text-foreground" />
          <span className="text-[10px] font-mono font-medium text-center">
            Your Device
          </span>
          <span className="text-[9px] text-emerald-600 font-mono flex items-center gap-0.5">
            <Lock className="w-2.5 h-2.5" />
            Keys stay here
          </span>
        </div>

        {/* Arrow + Label */}
        <div className="flex flex-col items-center justify-center gap-1 shrink-0 px-1">
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-[8px] font-mono text-muted-foreground text-center leading-tight">
            Encrypted
            <br />
            in transit
          </span>
        </div>

        {/* Selfbox Server */}
        <div className="flex-1 rounded border border-border p-3 flex flex-col items-center gap-2 bg-muted/20">
          <Server className="w-5 h-5 text-foreground" />
          <span className="text-[10px] font-mono font-medium text-center">
            Selfbox Server
          </span>
          <span className="text-[9px] text-muted-foreground font-mono flex items-center gap-0.5">
            <EyeOff className="w-2.5 h-2.5" />
            No key access
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-4 border-t border-border" />

      {/* Explanation */}
      <p className="mt-3 text-center text-xs text-muted-foreground leading-relaxed">
        We <span className="font-medium text-foreground">never</span> see your
        encryption keys. Data is private by architecture, not just policy.
      </p>

      {/* Badge */}
      <div className="mt-3 flex justify-center">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-[10px] font-mono text-muted-foreground">
          <Shield className="w-2.5 h-2.5" />
          Zero-Knowledge Architecture
        </span>
      </div>
    </div>
  );
}

function renderVisual(activeTab: number): React.ReactNode {
  switch (activeTab) {
    case 0:
      return <FileOrganizationVisual />;
    case 1:
      return <SearchVisual />;
    case 2:
      return <EncryptionVisual />;
    case 3:
      return <ZeroKnowledgeVisual />;
    default:
      return null;
  }
}

export function ProductStorageSection() {
  return (
    <ProductSectionLayout
      number="#01"
      label="Encrypted Storage"
      heading="Your files, protected by design."
      subtitle="Store anything with zero-knowledge encryption. Not even we can read your data."
      tabs={tabs}
      ctaLabel="All About Encrypted Storage"
      ctaHref="#"
      renderVisual={renderVisual}
    />
  );
}
