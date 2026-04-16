import { useEffect } from "react";
import { useAppState } from "@/lib/store";
import { isTauri, startWindowDrag } from "@/lib/tauri";
import { SignIn } from "@/pages/SignIn";
import { WorkspaceSetup } from "@/pages/WorkspaceSetup";
import { SelectiveSync } from "@/pages/SelectiveSync";
import { Status } from "@/pages/Status";
import { Conflicts } from "@/pages/Conflicts";
import { Settings } from "@/pages/Settings";

export function App() {
  const { screen } = useAppState();

  useEffect(() => {
    if (!isTauri()) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || event.detail !== 1) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.getAttribute("data-tauri-drag-region") !== null) return;
      if (target.closest("[data-no-drag],button,a,input,select,textarea")) return;
      if (!target.closest("[data-tauri-drag-region]")) return;

      event.preventDefault();
      startWindowDrag().catch(() => {});
    };

    const suppressWebviewContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("contextmenu", suppressWebviewContextMenu, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("contextmenu", suppressWebviewContextMenu, true);
    };
  }, []);

  switch (screen) {
    case "sign-in":
      return <SignIn />;
    case "workspace-setup":
      return <WorkspaceSetup />;
    case "selective-sync":
      return <SelectiveSync />;
    case "status":
      return <Status />;
    case "conflicts":
      return <Conflicts />;
    case "settings":
      return <Settings />;
  }
}
