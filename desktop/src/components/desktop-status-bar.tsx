import { useMemo } from "react";

import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { DesktopStatusBarAgents } from "./desktop-status-bar-agents";
import { DesktopStatusBarMetrics } from "./desktop-status-bar-metrics";

/**
 * Bottom status bar — Agents + CPU/MEM/Disk (Development console port).
 */
export function DesktopStatusBar() {
  const workspace = useDesktopWorkspaceData();

  const diskPath = useMemo(() => {
    for (const project of workspace.projects) {
      const cwd = project.localWorkingDirectory?.trim();
      if (cwd) return cwd;
    }
    return null;
  }, [workspace.projects]);

  return (
    <footer className="console-statusbar" aria-label="Status">
      <div className="console-statusbar-right">
        <DesktopStatusBarMetrics
          diskPath={diskPath}
          leading={<DesktopStatusBarAgents />}
        />
      </div>
    </footer>
  );
}
