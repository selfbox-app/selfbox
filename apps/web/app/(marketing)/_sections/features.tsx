"use client";

import {
  HardDriveIcon,
  TerminalIcon,
  ShieldCheckIcon,
  UsersIcon,
  KeyIcon,
  SearchIcon,
  LinkIcon,
  UploadIcon,
  GlobeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FolderSvg } from "../_components/folder-svg";
import { MotionDiv } from "../_components/fade-in";

const categories = [
  {
    label: "STORAGE",
    features: [
      {
        title: "Storage Provider Agnostic",
        icon: HardDriveIcon,
        description:
          "Swap between local filesystem, AWS S3, Cloudflare R2, or Vercel Blob with a single environment variable.",
        tags: ["S3", "R2", "Vercel Blob", "Local"],
      },
      {
        title: "Search Inside Files",
        icon: SearchIcon,
        description:
          "Find files by content, not just names. Selfbox transcribes images and PDFs into searchable text.",
        tags: ["OCR", "full-text", "PDF", "images"],
      },
      {
        title: "Virtual Bash Shell",
        icon: TerminalIcon,
        description:
          "Navigate files with familiar commands. ls, cd, find, cat, and grep through a virtual filesystem.",
        tags: ["ls", "cd", "grep", "cat"],
      },
    ],
  },
  {
    label: "SHARING",
    features: [
      {
        title: "Shared Links",
        icon: LinkIcon,
        description:
          "Generate shareable links with optional password protection, expiration dates, and download limits.",
        tags: ["password", "expiry", "download_limit"],
      },
      {
        title: "Upload Requests",
        icon: UploadIcon,
        description:
          "Let anyone send files to your storage without creating an account. Great for collecting documents.",
        tags: ["public", "no_account", "drag_drop"],
      },
    ],
  },
  {
    label: "DEVELOPER",
    features: [
      {
        title: "Workspace Teams",
        icon: UsersIcon,
        description:
          "Invite team members with role-based access. Organize files across workspaces with granular permissions.",
        tags: ["roles", "workspaces", "invite"],
      },
      {
        title: "Secure by Default",
        icon: ShieldCheckIcon,
        description:
          "Email/password and Google OAuth authentication. Sessions managed server-side with encrypted cookies.",
        tags: ["OAuth", "sessions", "encrypted"],
      },
      {
        title: "API Keys",
        icon: KeyIcon,
        description:
          "Programmatic access through API keys. Build integrations with full tRPC type safety.",
        tags: ["tRPC", "type-safe", "REST"],
      },
      {
        title: "Self-Hostable",
        icon: GlobeIcon,
        description:
          "Deploy anywhere Node.js runs. No vendor lock-in, no surprise pricing. Your data stays yours.",
        tags: ["Docker", "Vercel", "Railway"],
      },
    ],
  },
];

export function Features() {
  return (
    <section id="features" className="flex flex-col bg-background">
      <div className="grid-layout w-full py-20">
        <MotionDiv
          className="col-span-full mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="mkt-label text-primary">Built for power users</p>
          <h2 className="mkt-heading mt-2 text-foreground">
            Everything you need to manage files
          </h2>
          <p className="mkt-body mt-4 max-w-2xl text-balance text-muted-foreground">
            Selfbox gives you the full toolkit for file management, sharing, and
            collaboration&mdash;all self-hosted on your own terms.
          </p>
        </MotionDiv>

        {/* Categorized card grid */}
        {categories.map((cat) => (
          <div key={cat.label} className="col-span-full mb-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {cat.label}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cat.features.map(
                ({ title, icon: Icon, description, tags }, index) => (
                  <MotionDiv
                    key={title}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.4, delay: index * 0.06 }}
                  >
                    <div
                      className={cn(
                        "flex h-full flex-col rounded-xl border border-border bg-card p-5",
                        "transition-shadow hover:shadow-md",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-foreground/60" />
                        <h3 className="text-sm font-semibold text-foreground">
                          {title}
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </MotionDiv>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="w-full">
        <div className="grid-layout relative">
          <div className="col-span-full flex justify-start">
            <FolderSvg className="text-mkt-dark" />
          </div>
        </div>
      </div>
    </section>
  );
}
