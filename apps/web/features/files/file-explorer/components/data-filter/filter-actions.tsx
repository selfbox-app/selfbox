"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FilterActions({
  hasFilters,
  onClearAll,
}: {
  hasFilters: boolean;
  onClearAll: () => void;
}) {
  if (!hasFilters) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClearAll}
      className="text-muted-foreground shrink-0"
    >
      <X className="size-3" />
      <span className="hidden md:inline">Clear filters</span>
      <span className="md:hidden">Clear</span>
    </Button>
  );
}
