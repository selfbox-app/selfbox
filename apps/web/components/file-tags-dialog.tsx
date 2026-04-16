"use client";

import { useState, useEffect } from "react";
import { Check, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ManageTagsDialog } from "@/components/manage-tags-dialog";

export function FileTagsDialog({
  fileId,
  open,
  onOpenChange,
}: {
  fileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showManage, setShowManage] = useState(false);

  const utils = trpc.useUtils();
  const { data: allTags = [] } = trpc.tags.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: currentTags } = trpc.tags.getFileTags.useQuery(
    { fileId },
    { enabled: open },
  );

  // Sync selection state when current tags load
  useEffect(() => {
    if (currentTags) {
      setSelectedIds(new Set(currentTags.map((t) => t.id)));
    }
  }, [currentTags]);

  const setFileTags = trpc.tags.setFileTags.useMutation({
    onSuccess: () => {
      utils.tags.getFileTags.invalidate();
      utils.tags.getFileTagsBatch.invalidate();
      onOpenChange(false);
      toast.success("Tags updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggle = (tagId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleSave = () => {
    setFileTags.mutate({ fileId, tagIds: [...selectedIds] });
  };

  return (
    <>
      <Dialog open={open && !showManage} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Tags</DialogTitle>
            <DialogDescription>
              Select tags to apply to this file
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto">
            {allTags.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tags yet.{" "}
                <button
                  className="underline hover:text-foreground"
                  onClick={() => setShowManage(true)}
                >
                  Create one
                </button>
              </p>
            ) : (
              allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggle(tag.id)}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-muted transition-colors text-left"
                >
                  <div
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color ?? "#6b7280" }}
                  />
                  <span className="text-sm flex-1 truncate">{tag.name}</span>
                  {selectedIds.has(tag.id) && (
                    <Check className="size-4 text-primary shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManage(true)}
            >
              <Settings className="size-3.5" />
              Manage tags
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={setFileTags.isPending}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageTagsDialog
        open={showManage}
        onOpenChange={(v) => {
          setShowManage(v);
          if (!v) {
            // Refetch tags after managing
            utils.tags.list.invalidate();
          }
        }}
      />
    </>
  );
}
