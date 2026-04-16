"use client";

import { useState, useMemo } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterOption } from "./types";

export function FilterValuePicker({
  options,
  selectedValues,
  onToggle,
  placeholder = "Search...",
}: {
  options: FilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="size-3.5 text-muted-foreground shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="h-px bg-border/50" />
      <div className="max-h-60 overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No results
          </div>
        ) : (
          filtered.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => onToggle(option.value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium outline-none hover:bg-accent transition-colors"
              >
                <div
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30",
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                </div>
                {option.color && (
                  <div
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: option.color }}
                  />
                )}
                <span className="truncate">{option.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
