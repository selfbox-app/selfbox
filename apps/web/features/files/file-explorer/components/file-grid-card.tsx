"use client";

import {
  MoreVertical,
  Pencil,
  Trash2,
  Share2,
  Download,
  BarChart3,
  Sparkles,
  FileText,
  Loader2,
  Tag,
  Check,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { FileIcon } from "@/components/file-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isTextIndexable } from "@selfbox/common";
import { getFileCategory } from "@selfbox/common";
import { GridCardPreview } from "./grid-card-preview";
import { Avatar } from "@/components/avatar";
import { DraggableFileRow } from "./draggable-file-row";

type PluginAction = {
  workspacePluginId: string;
  actionId: string;
  label: string;
};

const CATEGORY_BG: Record<string, string> = {
  image: "bg-purple-500/10",
  video: "bg-pink-500/10",
  audio: "bg-amber-500/10",
  archive: "bg-orange-500/10",
  document: "bg-blue-500/10",
  other: "bg-muted",
};

export function FileGridCard({
  file,
  uploader,
  transcriptionStatus,
  pluginActions,
  isSelected,
  hasSelection,
  onClick,
  onToggleSelect,
  onDownload,
  onRename,
  onShare,
  onTrack,
  onEditTags,
  onDelete,
  onPluginAction,
  onViewTranscription,
  onGenerateTranscription,
}: {
  file: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    updatedAt: Date;
  };
  uploader?: { name: string | null; image: string | null };
  transcriptionStatus: string | undefined;
  pluginActions: PluginAction[];
  isSelected: boolean;
  hasSelection: boolean;
  onClick: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onDownload: () => void;
  onRename: () => void;
  onShare: () => void;
  onTrack: () => void;
  onEditTags: () => void;
  onDelete: () => void;
  onPluginAction: (action: PluginAction) => void;
  onViewTranscription: () => void;
  onGenerateTranscription: () => void;
}) {
  const category = getFileCategory(file.mimeType);

  return (
    <DraggableFileRow
      fileId={file.id}
      fileName={file.name}
      onClick={(e) => {
        // When in selection mode, plain clicks toggle selection instead of navigating
        if (hasSelection) {
          onToggleSelect(e);
          return;
        }
        onClick(e);
      }}
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card transition-all hover:shadow-md cursor-pointer overflow-hidden",
        isSelected && "ring-2 ring-primary border-primary",
      )}
    >
      {/* Selection checkbox — overlay top-left */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(e);
        }}
        className="absolute top-2 left-2 z-10 cursor-pointer p-1.5 -m-1.5"
      >
        <div
          className={cn(
            "flex size-5 items-center justify-center rounded border transition-all backdrop-blur",
            isSelected
              ? "bg-primary border-primary text-primary-foreground shadow-sm"
              : "bg-background/80 border-stone-300 hover:border-stone-400",
            !isSelected && !hasSelection && "opacity-0 group-hover:opacity-100",
          )}
        >
          {isSelected && <Check className="size-3" />}
        </div>
      </div>
      {/* Header: icon + name + menu */}
      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            CATEGORY_BG[category],
          )}
        >
          <FileIcon
            name={file.name}
            mimeType={file.mimeType}
            className="size-3.5"
          />
        </div>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {file.name}
        </span>
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
              <DropdownMenuItem onSelect={onDownload}>
                <Download />
                Download
              </DropdownMenuItem>
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
              <DropdownMenuItem onSelect={onEditTags}>
                <Tag />
                Edit Tags
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
              {(() => {
                if (transcriptionStatus === "ready") {
                  return (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={onViewTranscription}>
                        <FileText />
                        View Transcription
                      </DropdownMenuItem>
                    </>
                  );
                }
                if (transcriptionStatus === "processing") {
                  return (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled>
                        <Loader2 className="animate-spin" />
                        Transcription in progress...
                      </DropdownMenuItem>
                    </>
                  );
                }
                if (transcriptionStatus === "failed") {
                  return (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={onGenerateTranscription}>
                        <FileText />
                        Retry Transcription
                      </DropdownMenuItem>
                    </>
                  );
                }
                if (!transcriptionStatus && !isTextIndexable(file.mimeType)) {
                  return (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={onGenerateTranscription}>
                        <FileText />
                        Generate Transcription
                      </DropdownMenuItem>
                    </>
                  );
                }
                return null;
              })()}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Preview area */}
      <div className="mx-2.5 flex-1 min-h-[120px] rounded-lg bg-muted/40 overflow-hidden flex items-center justify-center">
        <GridCardPreview
          fileId={file.id}
          fileName={file.name}
          mimeType={file.mimeType}
        />
      </div>

      {/* Footer */}
      <div className="px-2.5 py-2 mt-auto flex items-center gap-1.5">
        <Avatar
          name={uploader?.name}
          src={uploader?.image}
          className="size-5 rounded-full shrink-0"
          width={20}
        />
        <span className="text-xs text-muted-foreground truncate">
          Modified {formatDate(file.updatedAt)}
        </span>
      </div>
    </DraggableFileRow>
  );
}
