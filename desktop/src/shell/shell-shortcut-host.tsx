import type { Dispatch, SetStateAction } from "react";

import { useShellShortcuts } from "./use-shell-chrome-state";
import type { useShellTabs } from "./use-shell-tabs";

/** Registers global shortcuts without forcing AppShellInner to subscribe to palette state. */
export function ShellShortcutHost({
  tabs,
  setComposeOpen,
  showSidePanel,
  panelPathname,
  setSidePanelCollapsed,
}: {
  tabs: ReturnType<typeof useShellTabs>;
  setComposeOpen: (open: boolean) => void;
  showSidePanel: boolean;
  panelPathname: string;
  setSidePanelCollapsed: Dispatch<SetStateAction<boolean>>;
}) {
  useShellShortcuts({
    tabs,
    setComposeOpen,
    showSidePanel,
    panelPathname,
    setSidePanelCollapsed,
  });
  return null;
}
