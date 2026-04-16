import { useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

/**
 * Hook that provides a download function for workspace files.
 * Fetches a signed URL, downloads as a blob, and triggers a
 * browser save dialog — works correctly for cross-origin URLs.
 */
export function useFileDownload() {
  const getDownloadUrl = trpc.files.getDownloadUrl.useMutation();

  const download = useCallback(
    async (fileId: string) => {
      try {
        const result = await getDownloadUrl.mutateAsync({ id: fileId });
        const response = await fetch(result.url);
        if (!response.ok) {
          throw new Error(`Download failed (${response.status})`);
        }
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = result.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch {
        toast.error("Failed to download file");
      }
    },
    [getDownloadUrl],
  );

  return { download };
}
