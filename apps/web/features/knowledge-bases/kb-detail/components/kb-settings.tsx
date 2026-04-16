"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function KBSettings({
  knowledgeBaseId,
}: {
  knowledgeBaseId: string;
}) {
  const workspace = useWorkspace();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: kb } = trpc.knowledgeBases.get.useQuery({
    id: knowledgeBaseId,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schemaPrompt, setSchemaPrompt] = useState("");
  const [model, setModel] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (kb) {
      setName(kb.name);
      setDescription(kb.description ?? "");
      setSchemaPrompt(kb.schemaPrompt);
      setModel(kb.model ?? "");
    }
  }, [kb]);

  const updateMutation = trpc.knowledgeBases.update.useMutation({
    onSuccess: () => {
      utils.knowledgeBases.get.invalidate({ id: knowledgeBaseId });
      utils.knowledgeBases.list.invalidate();
      toast.success("Settings saved");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.knowledgeBases.delete.useMutation({
    onSuccess: async () => {
      await utils.knowledgeBases.list.invalidate();
      router.push(`/w/${workspace.slug}/knowledge-bases`);
      toast.success("Knowledge base deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  if (!kb) return null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Description</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Schema Prompt (Wiki Structure)
          </label>
          <Textarea
            value={schemaPrompt}
            onChange={(e) => setSchemaPrompt(e.target.value)}
            rows={6}
          />
          <p className="text-xs text-muted-foreground">
            This prompt guides the AI on how to structure wiki pages when
            ingesting documents.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Model Override</label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder='e.g. openai/gpt-4o (leave empty for default)'
          />
        </div>

        <Button
          onClick={() =>
            updateMutation.mutate({
              id: knowledgeBaseId,
              name,
              description: description || undefined,
              schemaPrompt,
              model: model || undefined,
            })
          }
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending && <Loader2 className="animate-spin" />}
          Save Settings
        </Button>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-destructive mb-2">
          Danger Zone
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Deleting this knowledge base will remove all conversations and
          metadata. Wiki files in storage will be preserved.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
        >
          Delete Knowledge Base
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge Base</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{kb.name}" and all its
              conversations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteMutation.mutate({ id: knowledgeBaseId })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
