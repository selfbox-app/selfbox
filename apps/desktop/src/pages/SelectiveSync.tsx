import { useEffect, useState } from "react";
import { ChevronRight, Loader2, ArrowLeft } from "lucide-react";
import { bootstrap, type FolderSnapshot } from "@/lib/api";
import { useAppState, setState } from "@/lib/store";
import { getExcludedFolders, setExcludedFolders } from "@/lib/tauri";

interface FolderNode {
  folder: FolderSnapshot;
  children: FolderNode[];
  selected: boolean;
  size: number;
}

export function SelectiveSync() {
  const { accessToken, workspaceId } = useAppState();
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;
    Promise.all([bootstrap(accessToken, workspaceId), getExcludedFolders()])
      .then(([res, excluded]) => {
        const excludedSet = new Set(excluded);
        const nodes = buildTree(res.folders, res.files, excludedSet);
        setTree(nodes);
      })
      .finally(() => setLoading(false));
  }, [accessToken, workspaceId]);

  const toggleFolder = (id: string) => {
    setTree((prev) => toggleInTree(prev, id));
  };

  const applyChanges = async () => {
    setApplying(true);
    setError(null);
    try {
      const excluded = collectExcluded(tree);
      await setExcludedFolders(excluded);
      setState({ screen: "status" });
    } catch (e) {
      setError(String(e));
    } finally {
      setApplying(false);
    }
  };

  const totalSize = tree.reduce((sum, n) => sumTree(n) + sum, 0);
  const selectedSize = tree.reduce((sum, n) => selectedSizeOf(n) + sum, 0);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <div
        className="flex items-center gap-2 border-b border-border px-4 py-2.5"
        data-tauri-drag-region
      >
        <button
          onClick={() => setState({ screen: "status" })}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink-strong"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted"
          data-tauri-drag-region
        >
          selective sync
        </span>
      </div>

      <div className="px-5 pt-5 pb-3">
        <p className="text-xs leading-relaxed text-muted">
          Choose what to mirror locally. Unselected folders stay on the server.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-2">
        {tree.map((node) => (
          <FolderRow
            key={node.folder.id}
            node={node}
            depth={0}
            onToggle={toggleFolder}
          />
        ))}
        {tree.length === 0 && (
          <p className="py-8 text-center text-xs text-subtle">
            No folders in this workspace yet
          </p>
        )}
      </div>

      <div className="border-t border-border px-5 py-3">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            mirroring
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink">
            {formatSize(selectedSize)}{" "}
            <span className="text-subtle">
              / {formatSize(totalSize)}
            </span>
          </span>
        </div>
        {error && (
          <p className="mb-2 text-[10px] text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setState({ screen: "status" })}
            disabled={applying}
            className="flex-1 rounded-md border border-border-strong py-2 text-xs text-ink transition-colors hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={applyChanges}
            disabled={applying}
            className="flex-1 rounded-md bg-ink-strong py-2 text-xs font-medium text-paper transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  node,
  depth,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const totalSize = sumTree(node);

  return (
    <>
      <div
        className="group flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors hover:bg-surface"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
      >
        {node.children.length > 0 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-4 w-4 items-center justify-center text-subtle"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={node.selected}
            onChange={() => onToggle(node.folder.id)}
            className="h-3 w-3 accent-brand-500"
          />
          <span className="text-ink">{node.folder.name}</span>
        </label>
        <span className="font-mono text-[10px] tabular-nums text-subtle">
          {formatSize(totalSize)}
        </span>
      </div>
      {expanded &&
        node.children.map((child) => (
          <FolderRow
            key={child.folder.id}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildTree(
  folders: FolderSnapshot[],
  files: { folderId: string | null; size: number }[],
  excluded: Set<string>,
): FolderNode[] {
  const sizeByFolder = new Map<string | null, number>();
  for (const f of files) {
    sizeByFolder.set(f.folderId, (sizeByFolder.get(f.folderId) ?? 0) + f.size);
  }

  const nodeMap = new Map<string, FolderNode>();
  for (const folder of folders) {
    nodeMap.set(folder.id, {
      folder,
      children: [],
      selected: !excluded.has(folder.id),
      size: sizeByFolder.get(folder.id) ?? 0,
    });
  }

  const roots: FolderNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.folder.parentId && nodeMap.has(node.folder.parentId)) {
      nodeMap.get(node.folder.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
}

/** Walk the tree and return every folder id whose checkbox is unchecked. */
function collectExcluded(nodes: FolderNode[]): string[] {
  const out: string[] = [];
  const walk = (n: FolderNode) => {
    if (!n.selected) out.push(n.folder.id);
    for (const child of n.children) walk(child);
  };
  for (const n of nodes) walk(n);
  return out;
}

function toggleInTree(nodes: FolderNode[], id: string): FolderNode[] {
  return nodes.map((n) => {
    if (n.folder.id === id) return { ...n, selected: !n.selected };
    return { ...n, children: toggleInTree(n.children, id) };
  });
}

function sumTree(node: FolderNode): number {
  return (
    node.size + node.children.reduce((sum, c) => sum + sumTree(c), 0)
  );
}

function selectedSizeOf(node: FolderNode): number {
  if (!node.selected) return 0;
  return (
    node.size + node.children.reduce((sum, c) => sum + selectedSizeOf(c), 0)
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
