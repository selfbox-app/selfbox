"use client";

import {
  MoreHorizontal,
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
  Link,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatBytes, formatDateTime } from "@/lib/utils";
import { FileIcon } from "@/components/file-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TagBadge } from "@/components/tag-badge";
import { Avatar } from "@/components/avatar";
import { isTextIndexable } from "@selfbox/common";
import { DraggableFileRow } from "./draggable-file-row";

const ROW_GRID =
  "grid grid-cols-[28px_1fr_40px] sm:grid-cols-[28px_1fr_100px_200px_40px] gap-4 px-4 py-2.5 border-b last:border-b-0";

type PluginAction = {
  workspacePluginId: string;
  actionId: string;
  label: string;
};

type FileTag = { id: string; name: string; color: string | null };

export function FileRowContent({
  file,
  uploader,
  tags,
  transcriptionStatus,
  pluginActions,
  linkStatus,
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
  tags: FileTag[];
  transcriptionStatus: string | undefined;
  pluginActions: PluginAction[];
  linkStatus?: { shared: boolean; uploaded: boolean; tracked: boolean };
  isSelected: boolean;
  hasSelection: boolean;
  onClick: () => void;
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
  return (
    <DraggableFileRow
      fileId={file.id}
      fileName={file.name}
      onClick={onClick}
      className={cn(
        ROW_GRID,
        "hover:bg-muted/50 cursor-pointer group transition-colors",
        isSelected && "bg-primary/5",
      )}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(e);
        }}
        className="relative flex items-center justify-center cursor-pointer before:absolute before:-inset-y-2.5 before:-left-4 before:-right-2 before:content-['']"
      >
        <div
          className={cn(
            "flex size-5 items-center justify-center rounded border transition-colors",
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-stone-300 hover:border-stone-400",
            !isSelected && !hasSelection && "opacity-0 group-hover:opacity-100",
          )}
        >
          {isSelected && <Check className="size-3" />}
        </div>
      </div>
      <div className="flex items-center gap-2.5 min-w-0">
        <FileIcon
          name={file.name}
          mimeType={file.mimeType}
          className="size-4 shrink-0"
        />
        <span className="text-sm truncate">{file.name}</span>
        {linkStatus?.shared && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Share2 className="size-3 shrink-0 text-blue-500" />
            </TooltipTrigger>
            <TooltipContent>Shared</TooltipContent>
          </Tooltip>
        )}
        {linkStatus?.tracked && (
          <Tooltip>
            <TooltipTrigger asChild>
              <BarChart3 className="size-3 shrink-0 text-orange-500" />
            </TooltipTrigger>
            <TooltipContent>Tracked</TooltipContent>
          </Tooltip>
        )}
        {tags.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {tags.slice(0, 3).map((tag) => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} />
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="hidden sm:block">
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {formatBytes(file.size)}
        </span>
      </div>
      <div className="hidden sm:flex items-center gap-1.5">
        {uploader && (
          <Avatar
            name={uploader.name}
            src={uploader.image}
            className="size-4 rounded-full shrink-0"
            width={16}
          />
        )}
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {formatDateTime(file.updatedAt)}
        </span>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal />
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
    </DraggableFileRow>
  );
}
