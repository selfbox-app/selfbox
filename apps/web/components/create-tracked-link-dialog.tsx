'use client';

import { useState } from 'react';
import { Copy, Check, Link, BarChart3 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export function CreateTrackedLinkDialog({
  open,
  onOpenChange,
  target,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { id: string; name: string; type: 'file' | 'folder' };
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState<'view' | 'download'>('view');
  const [password, setPassword] = useState('');
  const [requireEmail, setRequireEmail] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();

  const createLink = trpc.trackedLinks.create.useMutation({
    onSuccess: (data) => {
      setTrackingUrl(data.trackingUrl);
      utils.trackedLinks.list.invalidate();
      toast.success('Tracked link created');
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleCreate = () => {
    createLink.mutate({
      ...(target.type === 'file'
        ? { fileId: target.id }
        : { folderId: target.id }),
      name: name || `${target.name} link`,
      description: description || undefined,
      access,
      password: password || undefined,
      requireEmail,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      validFrom: validFrom ? new Date(validFrom) : undefined,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      maxViews: maxViews ? parseInt(maxViews) : undefined,
    });
  };

  const handleCopy = async () => {
    if (trackingUrl) {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setTrackingUrl(null);
      setName('');
      setDescription('');
      setPassword('');
      setRequireEmail(false);
      setExpiresAt('');
      setValidFrom('');
      setValidUntil('');
      setMaxViews('');
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="size-4" />
            Create tracked link
          </DialogTitle>
          <DialogDescription>
            Track views and engagement for &ldquo;{target.name}&rdquo;
          </DialogDescription>
        </DialogHeader>

        {trackingUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={trackingUrl}
                readOnly
                className="text-xs font-mono"
              />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? (
                  <Check className="text-green-500" />
                ) : (
                  <Copy />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link to track who opens it, when, and from where.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Link name
              </label>
              <Input
                placeholder={`e.g. "${target.name} - Investor A"`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Description (optional)
              </label>
              <Input
                placeholder="Internal notes about this link..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Access level
              </label>
              <div className="flex gap-2">
                <Button
                  variant={access === 'view' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAccess('view')}
                >
                  View only
                </Button>
                <Button
                  variant={access === 'download' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAccess('download')}
                >
                  Download
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Password (optional)
              </label>
              <Input
                type="password"
                placeholder="Set a password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="requireEmail"
                checked={requireEmail}
                onChange={(e) => setRequireEmail(e.target.checked)}
                className="rounded border-border"
              />
              <label
                htmlFor="requireEmail"
                className="text-xs font-medium text-muted-foreground"
              >
                Require email to view
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Expires at
                </label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Max views
                </label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxViews}
                  onChange={(e) => setMaxViews(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Valid from
                </label>
                <Input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Valid until
                </label>
                <Input
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!trackingUrl && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createLink.isPending}
              >
                <Link className="size-3.5" />
                Create tracked link
              </Button>
            </>
          )}
          {trackingUrl && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
