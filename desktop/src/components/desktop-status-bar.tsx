import { useMemo } from "react";

import { useDesktopWorkspaceProjects } from "../lib/workspace-data";
import { DesktopStatusBarAgents } from "./desktop-status-bar-agents";
import { DesktopStatusBarMetrics } from "./desktop-status-bar-metrics";

/**
 * Bottom status bar — Agents + CPU/MEM/Disk (Development console port).
 */
export function DesktopStatusBar() {
  const { projects } = useDesktopWorkspaceProjects();

  const diskPath = useMemo(() => {
    for (const project of projects) {
      const cwd = project.localWorkingDirectory?.trim();
      if (cwd) return cwd;
    }
    return null;
  }, [projects]);

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
