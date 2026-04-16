'use client';

import { useState, useCallback } from 'react';
import { Copy, Trash2, XCircle, Upload, Plus, Check, Folder, ChevronRight, ArrowLeft, Home } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/confirm-delete-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function UploadLinksPage() {
  const { data: links } = trpc.uploadLinks.list.useQuery();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const createLink = trpc.uploadLinks.create.useMutation({
    onSuccess: (data) => {
      utils.uploadLinks.list.invalidate();
      setShowCreate(false);
      setName('');
      setSelectedFolderId(null);
      setSelectedFolderName(null);
      setShowFolderPicker(false);
      navigator.clipboard.writeText(data.uploadUrl);
      toast.success('Upload request created and copied');
    },
  });

  const revoke = trpc.uploadLinks.revoke.useMutation({
    onSuccess: () => {
      utils.uploadLinks.list.invalidate();
      toast.success('Upload request revoked');
    },
  });

  const deleteLink = trpc.uploadLinks.delete.useMutation({
    onSuccess: () => {
      utils.uploadLinks.list.invalidate();
      toast.success('Upload request deleted');
    },
  });

  const { requestDelete, dialogProps } = useConfirmDelete<string>({
    onConfirm: (id) => deleteLink.mutate({ id }),
  });

  const handleCopy = async (token: string, id: string) => {
    const url = `${window.location.origin}/upload/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div>
      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="flex flex-1 items-center gap-2 px-4">
          <Upload className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Upload Requests</span>
        </div>
        <div className="px-4">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus />
            Create link
          </Button>
        </div>
      </header>

      <div className="p-6">
        {!links || links.length === 0 ? (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-20 text-center">
            <Upload className="size-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No upload requests yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a request to let others upload files to your storage
            </p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_100px_120px_100px] gap-4 px-4 py-2 border-b bg-muted/50">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Destination
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Uploads
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
                className="grid grid-cols-[1fr_120px_100px_120px_100px] gap-4 px-4 py-2.5 border-b last:border-b-0 items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm truncate">{link.name}</span>
                  {!link.isActive && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-muted text-muted-foreground rounded-sm">
                      Revoked
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate">
                  {link.folderName ?? 'Root'}
                </span>
                <span className="text-xs font-mono text-muted-foreground tabular-nums">
                  {link.filesUploaded}
                  {link.maxFiles ? ` / ${link.maxFiles}` : ''}
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

        {/* Create Upload Link Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Create upload request</DialogTitle>
              <DialogDescription>
                Others can use this link to upload files to your storage
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                createLink.mutate({ name: name.trim(), folderId: selectedFolderId });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Name
                  </label>
                  <Input
                    placeholder="e.g. Photo submissions"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Destination folder
                  </label>
                  {showFolderPicker ? (
                    <FolderPicker
                      selectedFolderId={selectedFolderId}
                      onSelect={(id, name) => {
                        setSelectedFolderId(id);
                        setSelectedFolderName(name);
                        setShowFolderPicker(false);
                      }}
                      onCancel={() => setShowFolderPicker(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowFolderPicker(true)}
                      className="flex w-full items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <Folder className="size-4 text-muted-foreground" />
                      <span className={selectedFolderName ? "text-foreground" : "text-muted-foreground"}>
                        {selectedFolderName ?? "Root (My Files)"}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!name.trim() || createLink.isPending}
                >
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ConfirmDeleteDialog
        {...dialogProps}
        title="Delete upload link"
        description="Are you sure you want to delete this upload link? Anyone with the link will no longer be able to upload files."
        isPending={deleteLink.isPending}
      />
    </div>
  );
}

// ── Inline Folder Picker ──────────────────────────────────────────────

function FolderPicker({
  selectedFolderId,
  onSelect,
  onCancel,
}: {
  selectedFolderId: string | null;
  onSelect: (folderId: string | null, folderName: string | null) => void;
  onCancel: () => void;
}) {
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string | null; name: string }[]>([]);

  const { data: folders = [], isLoading } = trpc.folders.list.useQuery({
    parentId: browseFolderId,
  });

  const navigateInto = useCallback(
    (folderId: string, folderName: string) => {
      setHistory((prev) => [
        ...prev,
        { id: browseFolderId, name: browseFolderId ? "..." : "My Files" },
      ]);
      setBrowseFolderId(folderId);
    },
    [browseFolderId]
  );

  const navigateBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      setBrowseFolderId(prev.id);
    }
  }, [history]);

  return (
    <div className="rounded-lg border border-input overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        {history.length > 0 ? (
          <button type="button" onClick={navigateBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" />
          </button>
        ) : (
          <Home className="size-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">
          {browseFolderId ? "..." : "My Files"}
        </span>
      </div>

      {/* Folder list */}
      <div className="max-h-40 overflow-y-auto">
        {/* Root option */}
        {browseFolderId === null && (
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
              selectedFolderId === null ? "bg-accent" : "hover:bg-accent/50"
            )}
          >
            <Home className="size-4 text-muted-foreground" />
            <span>Root (My Files)</span>
          </button>
        )}

        {isLoading ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading...</div>
        ) : folders.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No subfolders</div>
        ) : (
          folders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                "flex items-center text-sm transition-colors",
                selectedFolderId === folder.id ? "bg-accent" : "hover:bg-accent/50"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(folder.id, folder.name)}
                className="flex flex-1 items-center gap-2 px-3 py-2 min-w-0"
              >
                <Folder className="size-4 shrink-0 text-primary" />
                <span className="truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                onClick={() => navigateInto(folder.id, folder.name)}
                className="shrink-0 px-2 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
