"use client";

import { X, Trash2, Download, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BatchActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onMove: () => void;
}

export function BatchActionBar({
  selectedCount,
  onClear,
  onDelete,
  onDownload,
  onMove,
}: BatchActionBarProps) {
  const isVisible = selectedCount > 0;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 flex h-11 -translate-x-1/2 items-center gap-3 rounded-full bg-stone-900 px-5 text-white shadow-lg transition-all duration-200",
        isVisible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      )}
    >
      {/* Selection count + clear */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium tabular-nums">
          {selectedCount} selected
        </span>
        <button
          onClick={onClear}
          className="flex items-center justify-center rounded-md p-0.5 text-stone-400 transition-colors hover:text-stone-300"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-stone-700" />

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-stone-800"
            >
              <Download className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>Download</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onMove}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-stone-800"
            >
              <FolderInput className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>Move</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>Delete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
