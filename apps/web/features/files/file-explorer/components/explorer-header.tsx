"use client";

import { Home, ChevronRight, FolderPlus, Upload, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CommandSearch } from "@/components/command-search";

type Breadcrumb = { id: string; name: string };

export function ExplorerHeader({
  breadcrumbs,
  onNavigateHome,
  onNavigateFolder,
  onCreateFolder,
  onManageTags,
  onUpload,
}: {
  breadcrumbs: Breadcrumb[] | undefined;
  onNavigateHome: () => void;
  onNavigateFolder: (folderId: string) => void;
  onCreateFolder: () => void;
  onManageTags: () => void;
  onUpload: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="flex flex-1 items-center gap-2 px-4">
        <nav className="flex items-center gap-1 text-sm">
          <button
            onClick={onNavigateHome}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <Home className="size-3.5" />
            <span>Home</span>
          </button>
          {breadcrumbs?.map((crumb) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground/60" />
              <button
                onClick={() => onNavigateFolder(crumb.id)}
                className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 px-4">
        <CommandSearch />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-sm" onClick={onManageTags}>
              <Tag className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Manage Tags</TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" onClick={onCreateFolder}>
          <FolderPlus />
          New Folder
        </Button>
        <Button size="sm" onClick={onUpload}>
          <Upload />
          Upload
        </Button>
      </div>
    </header>
  );
}
