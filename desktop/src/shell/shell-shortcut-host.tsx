import { useShellShortcuts } from "./use-shell-chrome-state";
import type { useShellTabs } from "./use-shell-tabs";

/** Registers global shortcuts without forcing AppShellInner to subscribe to palette state. */
export function ShellShortcutHost({
  tabs,
  setComposeOpen,
  setComposeAssigneeOverride,
  setComposeRelatedContactIdsOverride,
  showSidePanel,
  panelPathname,
  toggleSidePanelCollapsed,
}: {
  tabs: ReturnType<typeof useShellTabs>;
  setComposeOpen: (open: boolean) => void;
  setComposeAssigneeOverride: (id: string | null | undefined) => void;
  setComposeRelatedContactIdsOverride: (ids: string[] | undefined) => void;
  showSidePanel: boolean;
  panelPathname: string;
  toggleSidePanelCollapsed: () => void;
}) {
  useShellShortcuts({
    tabs,
    setComposeOpen,
    setComposeAssigneeOverride,
    setComposeRelatedContactIdsOverride,
    showSidePanel,
    panelPathname,
    toggleSidePanelCollapsed,
  });
  return null;
}
