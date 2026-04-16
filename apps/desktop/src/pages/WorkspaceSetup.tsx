import { useEffect, useState } from "react";
import { Loader2, ArrowRight, FolderOpen } from "lucide-react";
import { listWorkspaces, type WorkspaceSummary } from "@/lib/api";
import { useAppState, setState } from "@/lib/store";
import { getDefaultSyncRoot, pickFolder } from "@/lib/tauri";

export function WorkspaceSetup() {
  const { accessToken } = useAppState();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [localRoot, setLocalRoot] = useState("~/Selfbox");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDefaultSyncRoot().then(setLocalRoot).catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    listWorkspaces(accessToken)
      .then((res) => {
        setWorkspaces(res.workspaces);
        if (res.workspaces.length > 0) setSelected(res.workspaces[0]!.id);
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  const selectedWorkspace = workspaces.find((w) => w.id === selected);

  // Kick off the sync engine from the Status screen — it's the single point
  // that handles both fresh sign-in (via this handler) and app relaunch
  // (when the Rust engine is gone but persisted state says we're connected).
  const handleStart = () => {
    if (!selected || !selectedWorkspace || !accessToken) return;
    setStarting(true);
    setError("");

    const root = localRoot.replace(/\/+$/, "") + "/" + selectedWorkspace.name;

    setState({
      screen: "status",
      workspaceId: selected,
      workspaceName: selectedWorkspace.name,
      localRoot: root,
      syncStatus: { state: "syncing", message: "Starting initial sync..." },
    });
  };

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
        className="flex items-center justify-between px-6 pt-6"
        data-tauri-drag-region
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          step 2 of 2
        </span>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden px-8 pt-6">
        <h1 className="font-serif text-2xl italic leading-tight text-ink-strong">
          Pick a workspace
          <br />
          to mirror locally.
        </h1>

        <div className="mt-5 flex-1 overflow-y-auto pr-1">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Workspaces
          </p>
          <div className="-mx-2">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => setSelected(ws.id)}
                className={`group flex w-full items-center justify-between rounded-md px-2 py-2.5 text-left transition-colors ${
                  selected === ws.id
                    ? "bg-surface"
                    : "hover:bg-surface"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-1.5 w-1.5 rounded-full transition-colors ${
                      selected === ws.id
                        ? "bg-brand-500"
                        : "bg-border-strong"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-ink-strong">
                      {ws.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {ws.role} · {ws.slug}
                    </p>
                  </div>
                </div>
                {selected === ws.id && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-600">
                    selected
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border py-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Local folder
          </p>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-subtle" />
            <input
              type="text"
              value={localRoot}
              onChange={(e) => setLocalRoot(e.target.value)}
              className="flex-1 bg-transparent font-mono text-xs text-ink-strong outline-none"
            />
            <button
              onClick={async () => {
                try {
                  const picked = await pickFolder();
                  if (picked) setLocalRoot(picked);
                } catch {}
              }}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-brand-600 hover:underline underline-offset-4"
            >
              change
            </button>
          </div>
          {selectedWorkspace && (
            <p className="mt-2 font-mono text-[10px] text-subtle">
              ↳ {localRoot}/{selectedWorkspace.name}
            </p>
          )}
        </div>

        {error && (
          <p className="mb-3 text-xs text-danger">{error}</p>
        )}

        <button
          onClick={handleStart}
          disabled={!selected || starting}
          className="group mb-6 flex items-center justify-between rounded-md bg-ink-strong px-4 py-2.5 text-sm font-medium text-paper transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-ink-strong"
        >
          <span>{starting ? "Syncing…" : "Start syncing"}</span>
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>
    </div>
  );
}
