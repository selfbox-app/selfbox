'use client';

import { Copy, Trash2, XCircle, ExternalLink, Check, Share2 } from 'lucide-react';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { FileIcon } from '@/components/file-icon';
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/confirm-delete-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function SharedLinksPage() {
  const { data: links } = trpc.shares.list.useQuery();
  const utils = trpc.useUtils();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const revoke = trpc.shares.revoke.useMutation({
    onSuccess: () => {
      utils.shares.list.invalidate();
      toast.success('Link revoked');
    },
  });

  const deleteLink = trpc.shares.delete.useMutation({
    onSuccess: () => {
      utils.shares.list.invalidate();
      toast.success('Link deleted');
    },
  });

  const { requestDelete, dialogProps } = useConfirmDelete<string>({
    onConfirm: (id) => deleteLink.mutate({ id }),
  });

  const handleCopy = async (token: string, id: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="flex flex-1 items-center gap-2 px-4">
          <Share2 className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Shared Links</span>
        </div>
      </header>

      <div className="p-6">
        {!links || links.length === 0 ? (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-20 text-center">
            <ExternalLink className="size-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No shared links yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Share files or folders from the file explorer
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_100px_120px_100px] gap-4 px-4 py-2 border-b bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground">
                Item
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Access
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Downloads
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Created
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Actions
              </span>
            </div>

            {links.map((link) => (
              <div
                key={link.id}
                className="grid grid-cols-[1fr_80px_100px_120px_100px] gap-4 px-4 py-2.5 border-b last:border-b-0 items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon
                    name={link.itemName}
                    isFolder={link.itemType === 'folder'}
                    className="size-4 shrink-0"
                  />
                  <span className="text-sm truncate">{link.itemName}</span>
                  {!link.isActive && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-muted text-muted-foreground rounded-sm">
                      Revoked
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-muted-foreground capitalize">
                  {link.access}
                </span>
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  {link.downloadCount}
                  {link.maxDownloads ? ` / ${link.maxDownloads}` : ''}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  {formatDate(link.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleCopy(link.token, link.id)}
                        disabled={!link.isActive}
                      >
                        {copiedId === link.id ? (
                          <Check className="text-green-500" />
                        ) : (
                          <Copy />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>Copy link</TooltipContent>
                  </Tooltip>
                  {link.isActive && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => revoke.mutate({ id: link.id })}
                        >
                          <XCircle />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" sideOffset={8}>Revoke</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:text-destructive"
                        onClick={() => requestDelete(link.id)}
                      >
                        <Trash2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={8}>Delete</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDeleteDialog
        {...dialogProps}
        title="Delete share link"
        description="Are you sure you want to delete this share link? Anyone with the link will no longer be able to access the shared file."
        isPending={deleteLink.isPending}
      />
    </div>
  );
}
