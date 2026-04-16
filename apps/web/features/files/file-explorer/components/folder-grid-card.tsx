"use client";

import {
  MoreVertical,
  Pencil,
  Trash2,
  Share2,
  BarChart3,
  Sparkles,
  Folder,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DroppableFolderRow } from "./droppable-folder-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PluginAction = {
  workspacePluginId: string;
  actionId: string;
  label: string;
};

export function FolderGridCard({
  folder,
  pluginActions,
  isSelected,
  hasSelection,
  onClick,
  onToggleSelect,
  onDrop,
  onRename,
  onShare,
  onTrack,
  onDelete,
  onPluginAction,
}: {
  folder: { id: string; name: string; updatedAt: Date };
  pluginActions: PluginAction[];
  isSelected: boolean;
  hasSelection: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onDrop: (
    item: { id: string; type: "file" | "folder" },
    targetFolderId: string,
  ) => void;
  onRename: () => void;
  onShare: () => void;
  onTrack: () => void;
  onDelete: () => void;
  onPluginAction: (action: PluginAction) => void;
}) {
  return (
    <DroppableFolderRow
      folderId={folder.id}
      folderName={folder.name}
      onDrop={onDrop}
      onClick={(e) => {
        if (hasSelection) {
          onToggleSelect(e);
          return;
        }
        onClick(e);
      }}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 transition-all hover:bg-muted/50 cursor-pointer",
        isSelected && "ring-2 ring-primary border-primary bg-primary/5",
      )}
    >
      {/* Selection checkbox — replaces folder icon when in selection mode or hovered */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(e);
        }}
        className="relative shrink-0 cursor-pointer"
      >
        <Folder
          className={cn(
            "size-5 text-muted-foreground transition-opacity",
            (isSelected || hasSelection) && "opacity-0 group-hover:opacity-0",
            !isSelected && !hasSelection && "group-hover:opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute inset-0 flex size-5 items-center justify-center rounded border transition-opacity",
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-stone-300 hover:border-stone-400 bg-background",
            !isSelected && !hasSelection && "opacity-0 group-hover:opacity-100",
          )}
        >
          {isSelected && <Check className="size-3" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {folder.name}
        </span>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100 shrink-0"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShare}>
              <Share2 />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTrack}>
              <BarChart3 />
              Track
            </DropdownMenuItem>
            {pluginActions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                {pluginActions.map((action) => (
                  <DropdownMenuItem
                    key={`${action.workspacePluginId}:${action.actionId}`}
                    onSelect={() => onPluginAction(action)}
                  >
                    <Sparkles />
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DroppableFolderRow>
  );
}
