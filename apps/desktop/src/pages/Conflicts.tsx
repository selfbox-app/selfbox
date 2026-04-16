import { ArrowLeft } from "lucide-react";
import { setState } from "@/lib/store";

interface ConflictEntry {
  id: string;
  fileName: string;
  localSize: string;
  remoteSize: string;
  localTime: string;
  remoteTime: string;
  localSource: string;
  remoteSource: string;
}

const MOCK_CONFLICTS: ConflictEntry[] = [
  {
    id: "1",
    fileName: "spec.doc",
    localSize: "245 KB",
    remoteSize: "251 KB",
    localTime: "Today 2:15 PM",
    remoteTime: "Today 1:48 PM",
    localSource: "This device",
    remoteSource: "Web browser",
  },
];

export function Conflicts() {
  const handleResolve = (_id: string, _resolution: string) => {
    setState({ screen: "status" });
  };

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
          conflicts · {MOCK_CONFLICTS.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {MOCK_CONFLICTS.map((conflict) => (
          <div key={conflict.id} className="border-b border-border px-5 py-5">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
              Both edited · pick one
            </p>
            <h2 className="font-serif text-lg italic text-ink-strong">
              {conflict.fileName}
            </h2>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="border-l-2 border-brand-500 pl-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Local
                </p>
                <p className="mt-1 text-xs text-ink">
                  {conflict.localSize}
                </p>
                <p className="font-mono text-[10px] text-subtle">
                  {conflict.localTime}
                </p>
                <p className="font-mono text-[10px] text-subtle">
                  {conflict.localSource}
                </p>
              </div>
              <div className="border-l-2 border-border-strong pl-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Remote
                </p>
                <p className="mt-1 text-xs text-ink">
                  {conflict.remoteSize}
                </p>
                <p className="font-mono text-[10px] text-subtle">
                  {conflict.remoteTime}
                </p>
                <p className="font-mono text-[10px] text-subtle">
                  {conflict.remoteSource}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-0">
              <ResolveOption
                label="Keep remote"
                hint="discard local changes"
                onClick={() => handleResolve(conflict.id, "keep-remote")}
              />
              <ResolveOption
                label="Keep local"
                hint="overwrite remote"
                onClick={() => handleResolve(conflict.id, "keep-local")}
              />
              <ResolveOption
                label="Keep both"
                hint="save local as a copy"
                onClick={() => handleResolve(conflict.id, "keep-both")}
              />
            </div>
          </div>
        ))}

        {MOCK_CONFLICTS.length === 0 && (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <div className="mx-auto mb-3 h-2 w-2 rounded-full bg-success" />
              <p className="font-serif text-lg italic text-ink-strong">
                No conflicts
              </p>
              <p className="mt-1 text-xs text-muted">
                Everything's in sync.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResolveOption({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between border-t border-border py-2.5 text-left transition-colors hover:border-border-strong"
    >
      <span className="text-sm text-ink-strong">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-subtle transition-colors group-hover:text-brand-600">
        {hint} →
      </span>
    </button>
  );
}
