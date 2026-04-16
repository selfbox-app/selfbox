import { useSyncExternalStore } from "react";

export type AppScreen =
  | "sign-in"
  | "workspace-setup"
  | "selective-sync"
  | "status"
  | "conflicts"
  | "settings";

export interface SyncStatus {
  state: "idle" | "syncing" | "paused" | "error";
  message: string;
  progress?: { current: number; total: number; fileName?: string };
}

export interface AppState {
  screen: AppScreen;
  serverUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  userId: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  localRoot: string | null;
  cursor: number;
  syncStatus: SyncStatus;
}

const STORAGE_KEY = "selfbox-desktop-state";

const initialState: AppState = {
  screen: "sign-in",
  serverUrl: "",
  accessToken: null,
  refreshToken: null,
  deviceId: null,
  userId: null,
  workspaceId: null,
  workspaceName: null,
  localRoot: null,
  cursor: 0,
  syncStatus: { state: "idle", message: "Not connected" },
};

function loadPersistedState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...initialState };
    const saved = JSON.parse(raw) as Partial<AppState>;
    const restored = { ...initialState, ...saved };
    // If we had tokens, go straight to status screen
    if (restored.accessToken && restored.workspaceId) {
      restored.screen = "status";
      restored.syncStatus = { state: "syncing", message: "Reconnecting..." };
    } else if (restored.accessToken) {
      restored.screen = "workspace-setup";
    }
    return restored;
  } catch {
    return { ...initialState };
  }
}

function persistState(s: AppState) {
  try {
    const { screen, syncStatus, ...rest } = s;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {}
}

let state = loadPersistedState();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getState(): AppState {
  return state;
}

export function setState(partial: Partial<AppState>) {
  state = { ...state, ...partial };
  persistState(state);
  emit();
}

export function resetState() {
  state = { ...initialState };
  localStorage.removeItem(STORAGE_KEY);
  emit();
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
