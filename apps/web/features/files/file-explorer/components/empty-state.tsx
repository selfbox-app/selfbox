"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-20 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Upload className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium mb-1">No files yet</p>
      <p className="text-sm text-muted-foreground mb-4">
        Upload files or create a folder to get started
      </p>
      <Button size="sm" onClick={onUpload}>
        <Upload />
        Upload files
      </Button>
    </div>
  );
}
