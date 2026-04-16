import { useEffect, useState } from "react";
import {
  Pause,
  Play,
  Settings as SettingsIcon,
  FolderTree,
  ArrowUp,
  ArrowDown,
  Pencil,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { useAppState, setState, getState } from "@/lib/store";
import {
  pauseSync,
  resumeSync,
  openSyncFolder,
  onSyncStatus,
  onActivity,
  onAuthExpired,
  onTrayNavigate,
  onTrayTogglePause,
  onTrayOpenFolder,
  onTrayOpenWeb,
  openWeb,
  saveTokensToKeychain,
  startSync,
  updateEngineAccessToken,
  type ActivityEvent,
} from "@/lib/tauri";
import { refreshTokens } from "@/lib/api";
import { isCloudUrl } from "@/lib/server-url";
import {
  CHECK_INTERVAL_MS,
  checkForUpdate,
  installPendingUpdate,
  type AvailableUpdate,
} from "@/lib/updater";

interface ActivityItem {
  id: string;
  icon: "upload" | "download" | "rename" | "conflict" | "move" | "delete";
  name: string;
  time: string;
  at: number; // unix ms for sorting/relative time
}

const MAX_ACTIVITY = 20;

// Module-level so it survives Status page unmount/remount. A per-component
// useRef would reset on remount, leading to repeated start_sync invocations
// that tear down the background poll loop before its 10s tick fires.
let syncBooted = false;

// In-flight guard for the auth:expired handler. Rust throttles emits to one
// per 30s, but a push and poll failing back-to-back can still fire twice
// before the throttle kicks in — use this flag to coalesce concurrent
// refresh attempts on the JS side too.
let refreshingAuth = false;

async function handleAuthExpired() {
  if (refreshingAuth) return;
  refreshingAuth = true;
  try {
    const { refreshToken } = getState();
    if (!refreshToken) {
      // Refresh token gone too — fall back to sign-in.
      setState({ screen: "sign-in", accessToken: null, refreshToken: null });
      return;
    }
    const tokens = await refreshTokens(refreshToken);
    await saveTokensToKeychain(tokens.accessToken, tokens.refreshToken);
    setState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    await updateEngineAccessToken(tokens.accessToken);
  } catch (err) {
    // Refresh failed (e.g. refresh token also expired, or network down).
    // Drop to sign-in so the user can re-auth.
    console.error("[auth:expired] refresh failed", err);
    setState({ screen: "sign-in", accessToken: null, refreshToken: null });
  } finally {
    refreshingAuth = false;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function relativeTime(at: number): string {
  const seconds = Math.floor((Date.now() - at) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function Status() {
  const {
    workspaceName,
    localRoot,
    syncStatus,
    cursor,
    workspaceId,
    serverUrl,
    accessToken,
    deviceId,
  } = useAppState();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const conflicts = activity.filter((a) => a.icon === "conflict");
  const paused = syncStatus.state === "paused";
  const [pendingUpdate, setPendingUpdate] = useState<AvailableUpdate | null>(
    null,
  );
  const [installState, setInstallState] = useState<
    "idle" | "installing" | "error"
  >("idle");

  // Check for updates on mount + every CHECK_INTERVAL_MS. The hook
  // unwinds the interval on unmount; first-tick happens immediately so
  // the user sees "update available" within seconds of opening the
  // window after a release ships.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const update = await checkForUpdate();
      if (cancelled) return;
      setPendingUpdate(update);
    };
    tick();
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function installUpdate() {
    if (!pendingUpdate || installState === "installing") return;
    setInstallState("installing");
    try {
      await installPendingUpdate();
      // relaunch() inside installPendingUpdate replaces the process —
      // anything after this point only runs if relaunch fails.
    } catch (err) {
      console.error("[updater] install failed", err);
      setInstallState("error");
    }
  }

  // Boot the Rust sync engine once per process lifetime. The engine lives in
  // Rust memory, so it needs to be (re)started whenever the app is launched
  // — including when the window is auto-resumed from a persisted session.
  useEffect(() => {
    if (syncBooted) return;
    if (!workspaceId || !localRoot || !accessToken || !serverUrl || !deviceId) return;
    syncBooted = true;

    startSync({
      workspaceId,
      localRoot,
      deviceName: "Desktop",
      deviceId,
      serverUrl,
      accessToken,
    })
      .then(() => {
        setState({ syncStatus: { state: "idle", message: "Up to date" } });
      })
      .catch((err) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : JSON.stringify(err);
        setState({ syncStatus: { state: "error", message: msg } });
      });
  }, [workspaceId, localRoot, accessToken, serverUrl, deviceId]);

  // Subscribe to Rust-emitted events.
  //
  // Tauri's listen() is async — it returns a promise of the unlistener.
  // The naive pattern (`listen().then(u => unlisteners.push(u))`) loses
  // listeners across remounts: if cleanup runs before a `.then` resolves,
  // the unlistener arrives into an already-empty array and the listener
  // never gets removed. The next mount registers a fresh listener, the
  // old one keeps firing, and every emit triggers N React state updates
  // (visible as duplicated activity rows). Track cancellation with a
  // local flag so post-cleanup listeners are torn down immediately.
  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const register = async (
      attach: () => Promise<() => void>,
    ) => {
      const u = await attach();
      if (cancelled) {
        u();
      } else {
        unlisteners.push(u);
      }
    };

    register(() =>
      onSyncStatus((p) => {
        setState({
          syncStatus: { state: p.state, message: p.message },
          cursor: p.cursor,
        });
      }),
    );

    register(() =>
      onActivity((e: ActivityEvent) => {
        const id = `${e.kind}-${e.entityId}-${e.at}`;
        setActivity((prev) => {
          // Defensive dedup: if the same listener somehow fires twice for
          // one Rust emit (cleanup race, double-mount, etc.) the React
          // state shouldn't grow extra rows.
          if (prev.some((a) => a.id === id)) return prev;
          return [
            {
              id,
              icon: e.kind,
              name: e.name,
              time: "just now",
              at: new Date(e.at).getTime(),
            },
            ...prev,
          ].slice(0, MAX_ACTIVITY);
        });
      }),
    );

    register(() =>
      onTrayNavigate((screen) => {
        setState({ screen: screen as never });
      }),
    );

    register(() =>
      onTrayTogglePause(() => {
        togglePauseImpl();
      }),
    );

    register(() =>
      onTrayOpenFolder(() => {
        openSyncFolder().catch(() => {});
      }),
    );

    register(() =>
      onTrayOpenWeb(() => {
        openWeb().catch(() => {});
      }),
    );

    register(() =>
      onAuthExpired(() => {
        handleAuthExpired();
      }),
    );

    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, []);

  // Re-render relative timestamps every 30s
  useEffect(() => {
    const t = setInterval(() => {
      setActivity((prev) =>
        prev.map((a) => ({ ...a, time: relativeTime(a.at) })),
      );
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  // Sync is driven by the Rust background loop now (see spawn_sync_loop
  // in src-tauri/src/lib.rs). We only listen for status events here so
  // the UI stays in sync with what the daemon is doing, even when this
  // window was closed and just reopened.

  const togglePauseImpl = async () => {
    try {
      if (paused) {
        await resumeSync();
        setState({ syncStatus: { state: "syncing", message: "Resuming" } });
      } else {
        await pauseSync();
        setState({ syncStatus: { state: "paused", message: "Paused" } });
      }
    } catch {
      setState({
        syncStatus: paused
          ? { state: "syncing", message: "Resuming" }
          : { state: "paused", message: "Paused" },
      });
    }
  };

  const togglePause = togglePauseImpl;

  return (
    <div className="flex h-screen flex-col bg-paper">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b border-border px-4 py-2.5"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <StatusDot state={syncStatus.state} />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            selfbox
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton onClick={togglePause} title={paused ? "Resume" : "Pause"}>
            {paused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
          </IconButton>
          <IconButton
            onClick={() => setState({ screen: "selective-sync" })}
            title="Selective sync"
          >
            <FolderTree className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton
            onClick={() => setState({ screen: "settings" })}
            title="Settings"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      {/* Workspace info — editorial treatment */}
      <div className="px-5 pt-5 pb-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {syncStatus.state === "idle" ? "in sync" : syncStatus.state}
          {/* Cursor is an internal change-feed counter — useful for
              diagnosing sync issues but noise for end users. Hidden
              outside `vite dev` builds. */}
          {import.meta.env.DEV && cursor > 0 && ` · cursor ${cursor}`}
        </p>
        <h1 className="font-serif text-xl italic leading-tight text-ink-strong">
          {workspaceName ?? "Untitled"}
        </h1>
        <p className="mt-1 truncate font-mono text-[10px] text-subtle">
          {localRoot}
        </p>
        {/* Which Selfbox we're signed into — Cloud vs self-hosted. Last
            line of defense against the "I signed into the wrong server
            and didn't notice" case; keep it visible but understated. */}
        {serverUrl && (
          <p className="mt-0.5 truncate font-mono text-[10px] text-subtle">
            {isCloudUrl(serverUrl)
              ? "Selfbox Cloud"
              : `self-hosted · ${hostOf(serverUrl)}`}
          </p>
        )}
        {syncStatus.state === "error" && syncStatus.message && (
          <p className="mt-3 break-words text-xs leading-relaxed text-danger">
            {syncStatus.message}
          </p>
        )}

        {/* Progress bar — only when syncing */}
        {syncStatus.progress && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10px] text-muted">
              <span className="truncate">{syncStatus.progress.fileName}</span>
              <span className="ml-2 tabular-nums">
                {Math.round(
                  (syncStatus.progress.current / syncStatus.progress.total) * 100,
                )}
                %
              </span>
            </div>
            <div className="h-px w-full overflow-hidden bg-border">
              <div
                className="h-full bg-brand-500 transition-all duration-300"
                style={{
                  width: `${(syncStatus.progress.current / syncStatus.progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Activity list */}
      <div className="flex-1 overflow-y-auto border-t border-border">
        <div className="px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Recent activity
          </p>
        </div>
        <div className="px-5 pb-4">
          {activity.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-3 py-1.5 text-sm"
            >
              <ActivityIcon type={item.icon} />
              <span className="flex-1 truncate text-ink">
                {item.name}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-subtle">
                {item.time}
              </span>
            </div>
          ))}
          {activity.length === 0 && (
            <div className="py-8 text-center">
              <p className="font-serif text-sm italic text-muted">
                Quiet so far.
              </p>
              <p className="mt-1 text-xs text-subtle">
                Sync events will appear here as they happen.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Update banner — sits above the conflict banner so it's the first
          thing the user sees when both are active. Same visual weight as
          the conflict row to keep the bottom region calm. */}
      {pendingUpdate && installState !== "error" && (
        <button
          onClick={installUpdate}
          disabled={installState === "installing"}
          className="group flex items-center justify-between border-t border-border px-5 py-3 text-left transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="text-xs text-ink">
              {installState === "installing" ? (
                <span className="text-muted">Installing v{pendingUpdate.version}…</span>
              ) : (
                <>
                  <span className="font-medium">v{pendingUpdate.version}</span>{" "}
                  <span className="text-muted">available</span>
                </>
              )}
            </span>
          </div>
          {installState !== "installing" && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-brand-600">
              update &rarr;
            </span>
          )}
        </button>
      )}

      {/* Conflict banner — subtle, not alarming */}
      {conflicts.length > 0 && (
        <button
          onClick={() => setState({ screen: "conflicts" })}
          className="group flex items-center justify-between border-t border-border px-5 py-3 text-left transition-colors hover:bg-surface"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-warning" />
            <span className="text-xs text-ink">
              <span className="font-medium">{conflicts.length}</span>{" "}
              <span className="text-muted">
                conflict{conflicts.length > 1 ? "s" : ""} need attention
              </span>
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-brand-600">
            resolve →
          </span>
        </button>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: string }) {
  const color = {
    idle: "var(--color-success)",
    syncing: "var(--color-brand-500)",
    paused: "var(--color-subtle)",
    error: "var(--color-danger)",
  }[state] ?? "var(--color-subtle)";

  return (
    <div className="relative h-2 w-2">
      <div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {state === "syncing" && (
        <div
          className="absolute inset-0 animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink-strong"
    >
      {children}
    </button>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const map: Record<string, { Icon: typeof ArrowUp; color: string }> = {
    upload: { Icon: ArrowUp, color: "var(--color-brand-600)" },
    download: { Icon: ArrowDown, color: "var(--color-success)" },
    rename: { Icon: Pencil, color: "var(--color-muted)" },
    move: { Icon: FolderOpen, color: "var(--color-muted)" },
    delete: { Icon: AlertTriangle, color: "var(--color-subtle)" },
    conflict: { Icon: AlertTriangle, color: "var(--color-warning)" },
  };
  const entry = map[type];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon className="h-3 w-3 shrink-0" style={{ color }} />;
}
