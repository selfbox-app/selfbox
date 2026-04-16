"use client";

import { useState, useCallback } from "react";
import { ChevronRight, Folder, ArrowLeft, FolderPlus } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface MoveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  excludeFolderIds: Set<string>;
  onMove: (targetFolderId: string | null) => void;
}

export function MoveDialog({
  open,
  onOpenChange,
  selectedCount,
  excludeFolderIds,
  onMove,
}: MoveDialogProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  // undefined = nothing picked yet, null = root, string = folder id
  const [selectedTarget, setSelectedTarget] = useState<string | null | "root" | undefined>(undefined);
  const [history, setHistory] = useState<{ id: string | null; name: string }[]>([]);

  const { data: folders = [], isLoading } = trpc.folders.list.useQuery(
    { parentId: currentFolderId },
    { enabled: open }
  );

  // Filter out folders that are being moved
  const visibleFolders = folders.filter((f) => !excludeFolderIds.has(f.id));

  const navigateInto = useCallback(
    (folderId: string, folderName: string) => {
      setHistory((prev) => [...prev, { id: currentFolderId, name: currentFolderId ? "..." : "My Files" }]);
      setCurrentFolderId(folderId);
      setSelectedTarget(undefined);
    },
    [currentFolderId]
  );

  const navigateBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      setCurrentFolderId(prev.id);
      setSelectedTarget(undefined);
    }
  }, [history]);

  const handleMove = useCallback(() => {
    let target: string | null;
    if (selectedTarget === "root") target = null;
    else if (selectedTarget !== undefined) target = selectedTarget;
    else target = currentFolderId;
    onMove(target);
    onOpenChange(false);
    setCurrentFolderId(null);
    setSelectedTarget(undefined);
    setHistory([]);
  }, [selectedTarget, currentFolderId, onMove, onOpenChange]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open);
      if (!open) {
        setCurrentFolderId(null);
        setSelectedTarget(undefined);
        setHistory([]);
      }
    },
    [onOpenChange]
  );

  const currentLocationName = history.length > 0 ? "..." : "My Files";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Move {selectedCount} {selectedCount === 1 ? "item" : "items"} to...
          </DialogTitle>
        </DialogHeader>

        {/* Current location breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground px-1">
          {history.length > 0 && (
            <button
              onClick={navigateBack}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" />
            </button>
          )}
          <span className="font-medium text-foreground">
            {currentFolderId ? folders.find(() => true) && currentLocationName : "My Files"}
          </span>
        </div>

        {/* Folder list */}
        <div className="max-h-80 overflow-y-auto -mx-6 px-6">
          {/* Root folder option — always available */}
          {currentFolderId === null && (
            <button
              onClick={() => setSelectedTarget("root")}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                selectedTarget === "root"
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              )}
            >
              <Folder className="size-5 shrink-0 text-muted-foreground" />
              <span className="font-medium">My Files (root)</span>
            </button>
          )}

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading folders...
            </div>
          ) : visibleFolders.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No subfolders
            </div>
          ) : (
            visibleFolders.map((folder) => (
              <div
                key={folder.id}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2.5 text-sm transition-colors",
                  selectedTarget === folder.id
                    ? "bg-accent"
                    : "hover:bg-accent/50"
                )}
              >
                <button
                  onClick={() => setSelectedTarget(folder.id)}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <Folder className="size-5 shrink-0 text-primary" />
                  <span className="truncate">{folder.name}</span>
                </button>
                <button
                  onClick={() => navigateInto(folder.id, folder.name)}
                  className="shrink-0 p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleMove}
            disabled={selectedTarget === undefined}
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
