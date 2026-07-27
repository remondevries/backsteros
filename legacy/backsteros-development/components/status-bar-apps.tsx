"use client";

import { useEffect, useMemo, useState } from "react";

import {
  StatusBarHoverMenu,
  type StatusBarHoverItem,
} from "@/components/status-bar-hover-menu";
import {
  getRunningProjectRunCount,
  listRunningProjectRunSessions,
  subscribeProjectRunSessions,
  type ProjectRunSession,
} from "@/lib/project-run-sessions";

export function StatusBarApps({
  projectNames,
  onNavigate,
}: {
  projectNames: Record<string, string>;
  onNavigate: (session: ProjectRunSession) => void;
}) {
  const [running, setRunning] = useState(0);
  const [sessions, setSessions] = useState<ProjectRunSession[]>([]);

  useEffect(() => {
    const sync = () => {
      setRunning(getRunningProjectRunCount());
      setSessions(listRunningProjectRunSessions());
    };
    sync();
    return subscribeProjectRunSessions(sync);
  }, []);

  const menuItems = useMemo((): StatusBarHoverItem[] => {
    return sessions.map((session) => {
      const projectName =
        projectNames[session.projectId]?.trim() || session.projectId;
      return {
        id: session.projectId,
        title: projectName,
        subtitle: session.command,
        meta: "Running",
        onSelect: () => onNavigate(session),
      };
    });
  }, [onNavigate, projectNames, sessions]);

  return (
    <StatusBarHoverMenu
      label="Apps"
      value={running}
      emptyHint="No applications running"
      items={menuItems}
      dot={
        <span
          className={`statusbar-agents-dot${running > 0 ? " is-working" : ""}`}
          aria-hidden="true"
        />
      }
    />
  );
}
