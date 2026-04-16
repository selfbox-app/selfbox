import { useEffect, useState } from "react";
import { ArrowLeft, Monitor, Moon, Sun } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useAppState, setState, resetState } from "@/lib/store";
import { revokeDevice } from "@/lib/api";
import { useTheme, setTheme } from "@/lib/theme";
import {
  clearTokensFromKeychain,
  isAutostartEnabled,
  moveLocalRoot,
  pickFolder,
  setAutostart,
  startSync,
  stopSync,
} from "@/lib/tauri";

export function Settings() {
  const {
    workspaceName,
    workspaceId,
    localRoot,
    accessToken,
    deviceId,
    serverUrl,
  } = useAppState();
  const theme = useTheme();
  const [autostart, setAutostartState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<null | "switch" | "move" | "signout">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isAutostartEnabled()
      .then(setAutostartState)
      .catch(() => setAutostartState(false));
  }, []);

  const toggleAutostart = async (enabled: boolean) => {
    // Optimistic update — revert if the native call fails.
    setAutostartState(enabled);
    try {
      await setAutostart(enabled);
    } catch {
      setAutostartState(!enabled);
    }
  };

  const handleSwitchWorkspace = async () => {
    const ok = await ask(
      "Switching workspace will stop syncing the current one. Files stay on disk, but new changes won't sync until you pick another workspace.",
      { title: "Switch workspace?", kind: "warning" },
    );
    if (!ok) return;
    setBusy("switch");
    setError(null);
    try {
      await stopSync();
      setState({
        screen: "workspace-setup",
        workspaceId: null,
        workspaceName: null,
        localRoot: null,
        cursor: 0,
        syncStatus: { state: "idle", message: "Not connected" },
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleChangeLocalRoot = async () => {
    if (!localRoot || !workspaceId || !accessToken || !serverUrl) return;
    const picked = await pickFolder();
    if (!picked || picked === localRoot) return;

    const newRoot = picked.endsWith(workspaceName ?? "")
      ? picked
      : `${picked.replace(/\/$/, "")}/${workspaceName}`;

    const ok = await ask(
      `Move synced folder from:\n${localRoot}\n\nto:\n${newRoot}\n\nThe folder and its manifest will be moved and sync will resume. Works only within the same volume.`,
      { title: "Change local folder?", kind: "warning" },
    );
    if (!ok) return;

    setBusy("move");
    setError(null);
    try {
      await stopSync();
      await moveLocalRoot(localRoot, newRoot);
      setState({ localRoot: newRoot });
      await startSync({
        workspaceId,
        localRoot: newRoot,
        deviceName: "Desktop",
        deviceId: deviceId ?? "",
        serverUrl,
        accessToken,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSignOut = async () => {
    const ok = await ask(
      "This will revoke this device and stop syncing. Local files stay on disk.",
      { title: "Sign out?", kind: "warning" },
    );
    if (!ok) return;
    setBusy("signout");
    try {
      // Always tear down first so we don't leave an engine pinned to a
      // revoked token.
      await stopSync().catch(() => {});
      if (accessToken) {
        // Revoke is best-effort: if the server is unreachable, local
        // tokens still get cleared so the user isn't stuck logged in.
        try {
          await revokeDevice(accessToken);
        } catch {}
      }
      await clearTokensFromKeychain().catch(() => {});
      resetState();
    } finally {
      setBusy(null);
    }
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
          settings
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Account */}
        <Section label="Account">
          <Row label="Workspace" value={workspaceName ?? "—"} />
          <Row
            label="Device"
            mono
            value={deviceId ? deviceId.slice(0, 8) + "…" : "—"}
          />
          <button
            onClick={handleSwitchWorkspace}
            disabled={busy !== null}
            className="group mt-2 flex w-full items-center justify-between py-2 text-left disabled:opacity-50"
          >
            <span className="text-xs text-ink">
              {busy === "switch" ? "Switching…" : "Switch workspace"}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-subtle transition-colors group-hover:text-brand-600">
              change →
            </span>
          </button>
        </Section>

        {/* Sync */}
        <Section label="Sync">
          <Row
            label="Local folder"
            mono
            value={localRoot ?? "—"}
            truncate
          />
          <button
            onClick={handleChangeLocalRoot}
            disabled={busy !== null || !localRoot}
            className="group flex w-full items-center justify-between py-2 text-left disabled:opacity-50"
          >
            <span className="text-xs text-ink">
              {busy === "move" ? "Moving…" : "Change local folder"}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-subtle transition-colors group-hover:text-brand-600">
              move →
            </span>
          </button>
          <button
            onClick={() => setState({ screen: "selective-sync" })}
            className="group flex w-full items-center justify-between py-2 text-left"
          >
            <span className="text-xs text-ink">
              Selective sync
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-subtle transition-colors group-hover:text-brand-600">
              configure →
            </span>
          </button>
          {error && (
            <p className="mt-1 text-[10px] text-danger" role="alert">
              {error}
            </p>
          )}
        </Section>

        {/* Appearance */}
        <Section label="Appearance">
          <p className="mb-2 text-xs text-muted">Theme</p>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-0.5">
            <ThemeOption
              active={theme === "light"}
              onClick={() => setTheme("light")}
              icon={<Sun className="h-3 w-3" />}
              label="Light"
            />
            <ThemeOption
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
              icon={<Moon className="h-3 w-3" />}
              label="Dark"
            />
            <ThemeOption
              active={theme === "system"}
              onClick={() => setTheme("system")}
              icon={<Monitor className="h-3 w-3" />}
              label="Auto"
            />
          </div>
        </Section>

        {/* General */}
        <Section label="General">
          <label className="flex cursor-pointer items-center justify-between py-1 text-xs text-ink">
            <span>Launch at login</span>
            <Toggle
              checked={autostart === true}
              disabled={autostart === null}
              onChange={(next) => toggleAutostart(next)}
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between py-1 text-xs text-ink">
            <span>Sync on metered connections</span>
            <Toggle />
          </label>
        </Section>

        {/* About */}
        <div className="px-5 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
            Selfbox Desktop Sync · v0.1.0
          </p>
          <p className="mt-1 font-mono text-[10px] text-subtle">
            Made for indie devs.
          </p>
        </div>
      </div>

      {/* Sign out */}
      <div className="border-t border-border px-5 py-3">
        <button
          onClick={handleSignOut}
          disabled={busy !== null}
          className="group flex w-full items-center justify-between text-left disabled:opacity-50"
        >
          <span className="text-xs text-danger">
            {busy === "signout" ? "Signing out…" : "Sign out"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-subtle transition-colors group-hover:text-danger">
            revoke device →
          </span>
        </button>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-5 py-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 text-xs">
      <span className="text-muted">{label}</span>
      <span
        className={`${mono ? "font-mono text-[10px]" : ""} text-ink-strong ${truncate ? "max-w-[180px] truncate" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded py-1.5 text-[11px] transition-colors ${
        active
          ? "bg-surface-raised text-ink-strong"
          : "text-muted hover:text-ink-strong"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Toggle({
  checked,
  defaultChecked = false,
  disabled = false,
  onChange,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const isControlled = checked !== undefined;
  return (
    <input
      type="checkbox"
      {...(isControlled
        ? { checked, onChange: (e) => onChange?.(e.target.checked) }
        : { defaultChecked })}
      disabled={disabled}
      className="relative h-4 w-7 shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-colors before:absolute before:top-0.5 before:left-0.5 before:h-3 before:w-3 before:rounded-full before:bg-white before:transition-transform checked:bg-brand-500 checked:before:translate-x-3 disabled:opacity-50"
      style={{ WebkitAppearance: "none" }}
    />
  );
}

