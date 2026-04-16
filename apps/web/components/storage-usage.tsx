"use client";

import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/utils";

export function StorageUsage() {
  const { data } = trpc.storage.usage.useQuery();

  if (!data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-full rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  const percentage =
    data.limit != null
      ? Math.min((data.used / data.limit) * 100, 100)
      : data.used > 0
        ? 15
        : 0;

  return (
    <div className="space-y-2">
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        {percentage > 0 && (
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {data.limit != null
          ? `${formatBytes(data.used)} of ${formatBytes(data.limit)} used`
          : `${formatBytes(data.used)} used`}
      </p>
    </div>
  );
}
