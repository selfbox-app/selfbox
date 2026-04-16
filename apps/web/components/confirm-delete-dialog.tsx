"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook that manages delete confirmation state.
 * Returns the dialog props + a `requestDelete` function to trigger it.
 */
export function useConfirmDelete<T = string>({
  onConfirm,
}: {
  onConfirm: (item: T) => void;
}) {
  const [pending, setPending] = useState<T | null>(null);

  return {
    /** Call this instead of deleting directly */
    requestDelete: (item: T) => setPending(item),
    /** Spread these into <ConfirmDeleteDialog /> */
    dialogProps: {
      open: pending !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setPending(null);
      },
      onConfirm: () => {
        if (pending !== null) {
          onConfirm(pending);
          setPending(null);
        }
      },
    },
    /** The item pending deletion (for building title/description) */
    pendingItem: pending,
  };
}
