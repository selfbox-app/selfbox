"use client";

import { useState, useEffect } from "react";
import { ConfirmDeleteDialog, useConfirmDelete } from "@/components/confirm-delete-dialog";
import { useRouter } from "next/navigation";
import {
  Settings,
  Trash2,
  Loader2,
  HardDrive,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils";

export default function WorkspaceSettingsPage() {
  const workspace = useWorkspace();
  const router = useRouter();
  const { data } = trpc.workspaces.get.useQuery({ slug: workspace.slug });
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (data && !initialized) {
    setName(data.name);
    setSlug(data.slug);
    setInitialized(true);
  }

  const update = trpc.workspaces.update.useMutation({
    onSuccess: (updated) => {
      utils.workspaces.list.invalidate();
      utils.workspaces.get.invalidate();
      toast.success("Workspace updated");
      if (updated?.slug && updated.slug !== workspace.slug) {
        router.push(`/w/${updated.slug}/settings`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteWs = trpc.workspaces.delete.useMutation({
    onSuccess: () => {
      utils.workspaces.list.invalidate();
      toast.success("Workspace deleted");
      router.push("/home");
    },
    onError: (err) => toast.error(err.message),
  });

  const isOwner = workspace.role === "owner";
  const isAdmin = workspace.role === "owner" || workspace.role === "admin";

  return (
    <div>
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="flex flex-1 items-center gap-2 px-4">
          <Settings className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Settings</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* General settings */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">General</h2>
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Workspace name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Workspace URL</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">/w/</span>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
            </div>
            {isAdmin && (
              <Button
                onClick={() => update.mutate({ name, slug })}
                disabled={update.isPending}
                size="sm"
              >
                {update.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Save changes"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Storage */}
        {isAdmin && <BringYourOwnBucket />}

        {/* Danger zone */}
        {isOwner && (
          <DeleteWorkspaceSection
            onConfirm={() => deleteWs.mutate({ confirm: true })}
            isPending={deleteWs.isPending}
          />
        )}
      </div>
    </div>
  );
}

// ── Delete Workspace ──────────────────────────────────────────────────

function DeleteWorkspaceSection({
  onConfirm,
  isPending,
}: {
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
      <div className="rounded-lg border border-destructive/20 bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete workspace</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete this workspace and all its data
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash2 />
            Delete
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete the workspace, all files, folders,
              share links, and associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
              disabled={isPending}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Bring Your Own Bucket ─────────────────────────────────────────────

type Provider = "s3" | "r2" | "vercel" | "railway";

const ALL_PROVIDER_LABELS: Record<string, string> = {
  local: "Local Filesystem",
  s3: "Amazon S3",
  r2: "Cloudflare R2",
  vercel: "Vercel Blob",
  railway: "Railway Storage",
};

const PROVIDER_LABELS = ALL_PROVIDER_LABELS as Record<Provider, string>;

function BringYourOwnBucket() {
  const utils = trpc.useUtils();
  const { data: existing, isLoading } = trpc.storageConfig.get.useQuery();
  const { data: storageUsage } = trpc.storage.usage.useQuery();

  const [provider, setProvider] = useState<Provider>("s3");
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [endpoint, setEndpoint] = useState("");

  // Credentials - S3
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  // Credentials - R2
  const [r2AccountId, setR2AccountId] = useState("");
  const [r2AccessKeyId, setR2AccessKeyId] = useState("");
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState("");

  // Credentials - Vercel
  const [vercelToken, setVercelToken] = useState("");

  const [showSecrets, setShowSecrets] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(
    null,
  );
  const [hasEdited, setHasEdited] = useState(false);

  // Initialize form from existing config (without credentials - they're never returned)
  useEffect(() => {
    if (existing && !hasEdited) {
      setProvider(existing.provider as Provider);
      setBucket(existing.bucket);
      setRegion(existing.region ?? "");
      setEndpoint(existing.endpoint ?? "");
    }
  }, [existing, hasEdited]);

  const save = trpc.storageConfig.save.useMutation({
    onSuccess: () => {
      utils.storageConfig.get.invalidate();
      toast.success("Storage configuration saved");
      setHasEdited(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = trpc.storageConfig.remove.useMutation({
    onSuccess: () => {
      utils.storageConfig.get.invalidate();
      toast.success("Custom storage removed");
      setProvider("s3");
      setBucket("");
      setRegion("");
      setEndpoint("");
      setAccessKeyId("");
      setSecretAccessKey("");
      setR2AccountId("");
      setR2AccessKeyId("");
      setR2SecretAccessKey("");
      setVercelToken("");
      setTestResult(null);
      setHasEdited(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const { requestDelete: requestRemoveStorage, dialogProps: removeStorageDialogProps } = useConfirmDelete<boolean>({
    onConfirm: () => remove.mutate(),
  });

  const test = trpc.storageConfig.test.useMutation({
    onSuccess: () => {
      setTestResult("success");
      toast.success("Connection successful");
    },
    onError: (err) => {
      setTestResult("error");
      toast.error(err.message);
    },
  });

  function buildCredentials() {
    switch (provider) {
      case "s3":
        return { provider: "s3" as const, accessKeyId, secretAccessKey };
      case "railway":
        return { provider: "railway" as const, accessKeyId, secretAccessKey };
      case "r2":
        return {
          provider: "r2" as const,
          accountId: r2AccountId,
          accessKeyId: r2AccessKeyId,
          secretAccessKey: r2SecretAccessKey,
        };
      case "vercel":
        return { provider: "vercel" as const, readWriteToken: vercelToken };
    }
  }

  function buildPayload() {
    return {
      provider,
      bucket: provider === "vercel" ? "vercel-blob" : bucket,
      region: region || undefined,
      endpoint: endpoint || undefined,
      credentials: buildCredentials(),
    };
  }

  function hasRequiredFields() {
    if (provider !== "vercel" && !bucket) return false;
    switch (provider) {
      case "s3":
      case "railway":
        return !!accessKeyId && !!secretAccessKey;
      case "r2":
        return !!r2AccountId && !!r2AccessKeyId && !!r2SecretAccessKey;
      case "vercel":
        return !!vercelToken;
    }
  }

  const markEdited = () => {
    setHasEdited(true);
    setTestResult(null);
  };

  if (isLoading) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Storage</h2>
        <p className="text-sm text-muted-foreground">
          Manage your workspace storage provider
        </p>
      </div>

      {/* Active storage + usage */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Provider</p>
            <p className="text-sm font-semibold mt-0.5">
              {existing
                ? ALL_PROVIDER_LABELS[existing.provider] ?? existing.provider
                : ALL_PROVIDER_LABELS[storageUsage?.platformProvider ?? "local"] ?? "Local Filesystem"}
            </p>
            {existing && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Bucket: <span className="font-mono">{existing.bucket}</span>
              </p>
            )}
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="size-3" />
            Active
          </span>
        </div>
        {storageUsage && (
          <div className="border-t pt-3 space-y-2">
            <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
              {storageUsage.limit != null ? (
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{
                    width: `${Math.min((storageUsage.used / storageUsage.limit) * 100, 100)}%`,
                  }}
                />
              ) : storageUsage.used > 0 ? (
                <div className="h-full bg-primary rounded-full w-1/6" />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {formatBytes(storageUsage.used)}
              {storageUsage.limit != null
                ? ` of ${formatBytes(storageUsage.limit)} used`
                : " used (unlimited)"}
            </p>
          </div>
        )}
      </div>

      {/* Custom storage config */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Custom Storage</h3>
          <p className="text-xs text-muted-foreground">
            Override the default with your own storage bucket
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Provider</label>
          <Select
            value={provider}
            onValueChange={(v) => {
              setProvider(v as Provider);
              markEdited();
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="railway">Railway Storage</SelectItem>
              <SelectItem value="s3">Amazon S3</SelectItem>
              <SelectItem value="r2">Cloudflare R2</SelectItem>
              <SelectItem value="vercel">Vercel Blob</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider !== "vercel" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Bucket name</label>
            <Input
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value);
                markEdited();
              }}
              placeholder="my-storage-bucket"
            />
          </div>
        )}

        {(provider === "s3" || provider === "railway") && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Region</label>
                <Input
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    markEdited();
                  }}
                  placeholder={provider === "railway" ? "auto" : "us-east-1"}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Endpoint{" "}
                  <span className="text-muted-foreground font-normal">
                    {provider === "railway" ? "" : "(optional)"}
                  </span>
                </label>
                <Input
                  value={endpoint}
                  onChange={(e) => {
                    setEndpoint(e.target.value);
                    markEdited();
                  }}
                  placeholder={provider === "railway" ? "https://storage.railway.app" : "https://s3.amazonaws.com"}
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Credentials</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? (
                    <EyeOff className="size-3 mr-1" />
                  ) : (
                    <Eye className="size-3 mr-1" />
                  )}
                  {showSecrets ? "Hide" : "Show"}
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Access Key ID
                </label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={accessKeyId}
                  onChange={(e) => {
                    setAccessKeyId(e.target.value);
                    markEdited();
                  }}
                  placeholder={
                    existing ? "Enter new value to update" : "AKIA..."
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Secret Access Key
                </label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={secretAccessKey}
                  onChange={(e) => {
                    setSecretAccessKey(e.target.value);
                    markEdited();
                  }}
                  placeholder={
                    existing ? "Enter new value to update" : "Secret key"
                  }
                />
              </div>
            </div>
          </>
        )}

        {provider === "r2" && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account ID</label>
              <Input
                value={r2AccountId}
                onChange={(e) => {
                  setR2AccountId(e.target.value);
                  markEdited();
                }}
                placeholder="Cloudflare Account ID"
              />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Credentials</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? (
                    <EyeOff className="size-3 mr-1" />
                  ) : (
                    <Eye className="size-3 mr-1" />
                  )}
                  {showSecrets ? "Hide" : "Show"}
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Access Key ID
                </label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={r2AccessKeyId}
                  onChange={(e) => {
                    setR2AccessKeyId(e.target.value);
                    markEdited();
                  }}
                  placeholder={
                    existing ? "Enter new value to update" : "R2 Access Key ID"
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Secret Access Key
                </label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={r2SecretAccessKey}
                  onChange={(e) => {
                    setR2SecretAccessKey(e.target.value);
                    markEdited();
                  }}
                  placeholder={
                    existing
                      ? "Enter new value to update"
                      : "R2 Secret Access Key"
                  }
                />
              </div>
            </div>
          </>
        )}

        {provider === "vercel" && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Credentials</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setShowSecrets(!showSecrets)}
                >
                  {showSecrets ? (
                    <EyeOff className="size-3 mr-1" />
                  ) : (
                    <Eye className="size-3 mr-1" />
                  )}
                  {showSecrets ? "Hide" : "Show"}
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">
                  Read/Write Token
                </label>
                <Input
                  type={showSecrets ? "text" : "password"}
                  value={vercelToken}
                  onChange={(e) => {
                    setVercelToken(e.target.value);
                    markEdited();
                  }}
                  placeholder={
                    existing
                      ? "Enter new value to update"
                      : "vercel_blob_rw_..."
                  }
                />
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => save.mutate(buildPayload())}
              disabled={!hasRequiredFields() || save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <HardDrive className="size-3.5 mr-1" />
              )}
              {existing ? "Update" : "Save"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => test.mutate(buildPayload())}
              disabled={!hasRequiredFields() || test.isPending}
            >
              {test.isPending ? (
                <Loader2 className="animate-spin" />
              ) : testResult === "success" ? (
                <CheckCircle2 className="size-3.5 mr-1 text-green-500" />
              ) : testResult === "error" ? (
                <XCircle className="size-3.5 mr-1 text-destructive" />
              ) : null}
              Test connection
            </Button>
          </div>
          {existing && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => requestRemoveStorage(true)}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Remove"
              )}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDeleteDialog
        {...removeStorageDialogProps}
        title="Remove custom storage"
        description="Remove custom storage and revert to the default? Existing files will remain in your bucket."
        isPending={remove.isPending}
      />
    </div>
  );
}
