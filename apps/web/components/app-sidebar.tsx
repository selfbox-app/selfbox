"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FolderOpen,
  Share2,
  Upload,
  Settings,
  Users,
  Key,
  BarChart3,
  Puzzle,
  TerminalSquare,
  Plus,
  ChevronLeft,
  ChevronsUpDown,
  ExternalLink,
  BookOpen,
  Brain,
  MessageSquare,
  Bot,
  Bell,
  User,
  Boxes,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/assets/logo";
import { trpc } from "@/lib/trpc/client";
import { StorageUsage } from "./storage-usage";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Maps plugin manifest icon names to Lucide components.
 * Add entries here when a plugin uses a new icon name in its sidebarItem.
 */
const SIDEBAR_ICON_MAP: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  brain: Brain,
  "message-square": MessageSquare,
  bot: Bot,
  puzzle: Puzzle,
  "bar-chart": BarChart3,
  terminal: TerminalSquare,
  settings: Settings,
  folder: FolderOpen,
  boxes: Boxes,
};

type SidebarArea = "workspace" | "account";

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive: boolean;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={cn(
        "flex h-8 items-center gap-3.5 rounded-lg px-2 text-sm font-medium transition-colors",
        "border border-transparent",
        isActive
          ? "bg-card text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
      {external && (
        <ExternalLink className="size-3 ml-auto shrink-0 opacity-50" />
      )}
    </Link>
  );
}

function NavSection({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3.5 pl-2 pb-2">
        <span className="font-mono text-xs font-medium uppercase text-muted-foreground">
          {label}
        </span>
        {action}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
  "bg-rose-500",
];

function getAvatarColor(name: string): string {
  const char = name.charAt(0).toUpperCase();
  const index = char.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index]!;
}

export function AppSidebar({
  user,
}: {
  user: { name?: string | null; email: string; image?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const slugMatch = pathname.match(/\/w\/([^/]+)/);
  const slug = slugMatch?.[1] ?? "";
  const prefix = `/w/${slug}`;

  const area: SidebarArea = useMemo(() => {
    if (pathname.startsWith("/settings")) return "account";
    return "workspace";
  }, [pathname]);

  const { data: workspacesList, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();
  const currentWorkspace =
    workspacesList?.find((w) => w.slug === slug) ?? null;

  // Query installed plugins with sidebar items
  const { data: installedPlugins } = trpc.plugins.installed.useQuery(
    undefined,
    { enabled: area === "workspace" && !!slug },
  );

  const pluginNavItems = useMemo(() => {
    if (!installedPlugins) return [];
    return installedPlugins
      .filter(
        (p) =>
          p.status === "active" &&
          p.manifest &&
          typeof p.manifest === "object" &&
          "sidebarItem" in (p.manifest as Record<string, unknown>) &&
          (p.manifest as Record<string, unknown>).sidebarItem,
      )
      .map((p) => {
        const item = (p.manifest as Record<string, unknown>).sidebarItem as {
          label: string;
          icon: string;
          path: string;
        };
        return {
          href: `${prefix}${item.path}`,
          label: item.label,
          icon: SIDEBAR_ICON_MAP[item.icon] ?? Puzzle,
          key: `plugin-${p.pluginSlug}`,
        };
      });
  }, [installedPlugins, prefix]);

  const fileItems = [
    { href: prefix, label: "My Files", icon: FolderOpen, key: "files" },
    {
      href: `${prefix}/shared-links`,
      label: "Shared Links",
      icon: Share2,
      key: "shares",
    },
    {
      href: `${prefix}/upload-links`,
      label: "Upload Requests",
      icon: Upload,
      key: "uploads",
    },
    {
      href: `${prefix}/tracked-links`,
      label: "Tracked Links",
      icon: BarChart3,
      key: "tracked",
    },
  ];

  const toolItems = [
    {
      href: `${prefix}/chat`,
      label: "Chat",
      icon: Bot,
      key: "chat",
    },
    {
      href: `${prefix}/plugins`,
      label: "Extensions",
      icon: Puzzle,
      key: "plugins",
    },
    {
      href: `${prefix}/terminal`,
      label: "Terminal",
      icon: TerminalSquare,
      key: "terminal",
    },
  ];

  const workspaceItems = [
    {
      href: `${prefix}/settings`,
      label: "Settings",
      icon: Settings,
      key: "settings",
    },
    {
      href: `${prefix}/settings/members`,
      label: "Members",
      icon: Users,
      key: "members",
    },
    {
      href: `${prefix}/settings/api-keys`,
      label: "API Keys",
      icon: Key,
      key: "api-keys",
    },
  ];

  function isActive(item: { href: string; key: string }) {
    if (item.key === "files") {
      return (
        pathname === prefix ||
        pathname.startsWith(`${prefix}/folder`) ||
        pathname.startsWith(`${prefix}/file`)
      );
    }
    if (item.key === "settings") {
      return pathname === item.href;
    }
    return pathname.startsWith(item.href);
  }

  return (
    <aside className="fixed h-screen w-full max-w-72 flex flex-col px-4 py-6">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-0 w-fit hover:opacity-70 pb-6 ml-1"
      >
        <Logo className="size-7 text-foreground" />
        <span className="font-mono text-sm font-bold uppercase tracking-wide">
          Selfbox
        </span>
      </Link>

      {/* Nav + bottom */}
      <div className="flex flex-1 flex-col justify-between gap-8 overflow-y-auto">
        {/* Navigation */}
        <nav className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 items-stretch">
            {/* Workspace selector / account back link */}
            {area === "account" ? (
              <Link
                href="/home"
                className="flex h-8 items-center gap-3.5 px-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                <ChevronLeft className="size-4 shrink-0" />
                <span>Back to Home</span>
              </Link>
            ) : !workspacesList ? (
              <div className="flex h-8 items-center gap-3.5 px-2">
                <Skeleton className="size-[18px] rounded-full bg-muted" />
                <Skeleton className="h-4 w-28 bg-muted" />
              </div>
            ) : currentWorkspace ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "flex h-8 items-center gap-3.5 rounded-lg px-2 w-full",
                    "border border-transparent text-foreground font-semibold text-sm",
                    "hover:bg-accent transition-colors outline-none"
                  )}
                >
                  <div className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full text-white text-[9px] font-bold", getAvatarColor(currentWorkspace.name))}>
                    {currentWorkspace.name[0]?.toUpperCase() ?? "W"}
                  </div>
                  <span className="truncate">{currentWorkspace.name}</span>
                  <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground ml-auto" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={4}
                  className="w-56"
                >
                  {workspacesList?.map((ws) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onSelect={() => {
                        if (ws.slug !== slug) {
                          window.location.href = `/w/${ws.slug}`;
                        }
                      }}
                      className={
                        ws.id === currentWorkspace.id ? "bg-accent" : ""
                      }
                    >
                      <div className={cn("flex size-5 items-center justify-center rounded-full text-white font-bold text-[9px] shrink-0", getAvatarColor(ws.name))}>
                        {ws.name[0]?.toUpperCase() ?? "W"}
                      </div>
                      <span className="truncate">{ws.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => router.push("/onboarding")}
                  >
                    <Plus className="size-4" />
                    Create workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "flex h-8 items-center gap-3.5 rounded-lg px-2 w-full",
                    "border border-transparent text-foreground font-semibold text-sm",
                    "hover:bg-accent transition-colors outline-none"
                  )}
                >
                  <Logo className="size-[18px] shrink-0" />
                  <span className="truncate">Selfbox</span>
                  <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground ml-auto" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  sideOffset={4}
                  className="w-56"
                >
                  {workspacesList?.map((ws) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onSelect={() => {
                        window.location.href = `/w/${ws.slug}`;
                      }}
                    >
                      <div className={cn("flex size-5 items-center justify-center rounded-full text-white font-bold text-[9px] shrink-0", getAvatarColor(ws.name))}>
                        {ws.name[0]?.toUpperCase() ?? "W"}
                      </div>
                      <span className="truncate">{ws.name}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => router.push("/onboarding")}
                  >
                    <Plus className="size-4" />
                    Create workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {area === "account" ? (
              /* Account-level navigation */
              <NavSection label="Account">
                <NavItem
                  href="/settings/account"
                  icon={User}
                  label="Account Settings"
                  isActive={pathname === "/settings/account"}
                />
                <NavItem
                  href="/settings/notifications"
                  icon={Bell}
                  label="Notifications"
                  isActive={pathname === "/settings/notifications"}
                />
              </NavSection>
            ) : (
              /* Workspace-level navigation */
              <>
                {/* File section */}
                <NavSection label="Files">
                  {fileItems.map((item) => (
                    <NavItem
                      key={item.key}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      isActive={isActive(item)}
                    />
                  ))}
                </NavSection>

                {/* Tools section */}
                <NavSection label="Tools">
                  {toolItems.map((item) => (
                    <NavItem
                      key={item.key}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      isActive={isActive(item)}
                    />
                  ))}
                  {pluginNavItems.map((item) => (
                    <NavItem
                      key={item.key}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      isActive={pathname.startsWith(item.href)}
                    />
                  ))}
                </NavSection>

                {/* Workspace section */}
                <NavSection label="Workspace">
                  {workspaceItems.map((item) => (
                    <NavItem
                      key={item.key}
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      isActive={isActive(item)}
                    />
                  ))}
                </NavSection>
              </>
            )}
          </div>
        </nav>

        {/* Bottom section */}
        <div className="flex flex-col gap-2 items-stretch">
          {/* Storage usage (workspace area only) */}
          {area === "workspace" && (
            <div className="rounded-lg border border-border p-2.5 mb-2">
              <StorageUsage />
            </div>
          )}

          {/* Docs link */}
          <Link
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 flex items-center gap-3.5 px-2 w-full text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent rounded-lg text-sm font-medium transition-colors"
          >
            <ExternalLink className="size-4 shrink-0" />
            <span>Docs</span>
          </Link>

          {/* User menu */}
          <UserMenu user={user} collapsed={false} />
        </div>
      </div>
    </aside>
  );
}
