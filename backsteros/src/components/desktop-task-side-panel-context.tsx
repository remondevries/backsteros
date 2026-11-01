import { createContext, useContext, type ReactNode } from "react";

import { ProjectsSidePanelIcon } from "@backsteros/ui";

export type DesktopTaskSidePanelControls = {
  /** Collapse the Changes / side column to the icon strip. */
  hide: () => void;
  /** Expand the Changes / side column from the strip. */
  show: () => void;
  /** Toggle collapsed ↔ expanded. */
  toggle: () => void;
  /** True while the Changes rail is collapsed to the strip. */
  collapsed: boolean;
};

const DesktopTaskSidePanelContext =
  createContext<DesktopTaskSidePanelControls | null>(null);

export function DesktopTaskSidePanelProvider({
  value,
  children,
}: {
  value: DesktopTaskSidePanelControls;
  children: ReactNode;
}) {
  return (
    <DesktopTaskSidePanelContext.Provider value={value}>
      {children}
    </DesktopTaskSidePanelContext.Provider>
  );
}

export function useDesktopTaskSidePanel(): DesktopTaskSidePanelControls | null {
  return useContext(DesktopTaskSidePanelContext);
}

/** Collapse / expand control for the task Changes rail — sits on the timer row. */
export function DesktopTaskSidePanelToggle() {
  const panel = useDesktopTaskSidePanel();
  if (!panel) return null;

  const label = panel.collapsed ? "Show changes (])" : "Hide changes (])";

  return (
    <button
      type="button"
      className="desktop-task-side-panel-toggle"
      onClick={panel.toggle}
      title={label}
      aria-label={label}
      aria-pressed={panel.collapsed}
    >
      <ProjectsSidePanelIcon
        size={16}
        collapsed={panel.collapsed}
        rail="end"
      />
    </button>
  );
}
