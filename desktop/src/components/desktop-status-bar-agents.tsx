import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getInboxTaskRouteHref, getTaskDisplayId } from "@backsteros/ui";

import type { StatusBarAgentItem } from "../lib/agent/agent-activity";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import {
  StatusBarHoverMenu,
  type StatusBarHoverItem,
} from "./desktop-status-bar-hover-menu";

function activityLabel(activity: StatusBarAgentItem["activity"]): string {
  switch (activity) {
    case "working":
      return "Working";
    case "attention":
      return "Needs attention";
    case "idle":
      return "Idle";
    case "present":
      return "Open";
  }
}

/**
 * Active agents for the bottom status bar (Development status-bar port).
 */
export function DesktopStatusBarAgents() {
  const navigate = useNavigate();
  const workspace = useDesktopWorkspaceData();
  const { summary, statusItems } = useDesktopAgentStatus();

  const labelsByTaskId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of statusItems) {
      const task = workspace.allTasks.find((entry) => entry.id === item.taskId);
      if (!task) {
        map[item.taskId] = item.projectLabel;
        continue;
      }
      const displayId = getTaskDisplayId(
        {
          number: task.number,
          projectId: task.projectId,
          contactId: task.contactId,
        },
        task.projectKey ?? null,
      );
      const title = task.title?.trim() || "";
      map[item.taskId] =
        displayId && title
          ? `${displayId} · ${title}`
          : displayId || title || item.taskId.slice(0, 8);
    }
    return map;
  }, [statusItems, workspace.allTasks]);

  const menuItems = useMemo((): StatusBarHoverItem[] => {
    return statusItems.map((item) => {
      const task = workspace.allTasks.find((entry) => entry.id === item.taskId);
      return {
        id: item.taskId,
        title: labelsByTaskId[item.taskId] ?? item.projectLabel,
        subtitle: item.projectLabel,
        meta: activityLabel(item.activity),
        onSelect: () => {
          if (task?.number != null) {
            navigate(
              getInboxTaskRouteHref({
                number: task.number,
                projectKey: task.projectKey,
                contactKey: null,
              }),
            );
            return;
          }
          navigate(`/tasks/${item.taskId}`);
        },
      };
    });
  }, [labelsByTaskId, navigate, statusItems, workspace.allTasks]);

  const detailParts: string[] = [];
  if (summary.working > 0) detailParts.push(`${summary.working} working`);
  if (summary.attention > 0) {
    detailParts.push(`${summary.attention} needs attention`);
  }
  const detail = detailParts.join(" · ");

  const dotClass =
    summary.working > 0
      ? "statusbar-agents-dot is-working"
      : summary.attention > 0
        ? "statusbar-agents-dot is-attention"
        : "statusbar-agents-dot";

  return (
    <StatusBarHoverMenu
      label="Agents"
      value={
        <>
          {summary.total}
          {detail ? (
            <span className="statusbar-metric-pct"> · {detail}</span>
          ) : null}
        </>
      }
      emptyHint="No active agents"
      items={menuItems}
      dot={<span className={dotClass} aria-hidden="true" />}
    />
  );
}
