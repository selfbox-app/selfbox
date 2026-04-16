import { useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "selfbox-theme";
const listeners = new Set<() => void>();

function currentTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {}
  return "system";
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme === "system") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", theme);
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
  applyTheme(theme);
  for (const fn of listeners) fn();
}

export function useTheme(): Theme {
  useEffect(() => {
    applyTheme(currentTheme());
  }, []);

  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentTheme(),
    () => "system",
  );
}

/** Returns the resolved theme (never "system") */
export function useResolvedTheme(): "light" | "dark" {
  const theme = useTheme();
  const prefers =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  return theme === "system" ? prefers : theme;
}
