"use client";

import { useEffect, useMemo, useState } from "react";
import type { Task } from "@backsteros/contracts";
import { formatTaskDisplayId } from "@backsteros/ui";

import {
  StatusBarHoverMenu,
  type StatusBarHoverItem,
} from "@/components/status-bar-hover-menu";
import type {
  AgentActivity,
  AgentActivitySummary,
  StatusBarAgentItem,
} from "@/lib/agent-activity";
import { useConsoleApi } from "@/lib/api-context";

function activityLabel(activity: AgentActivity): string {
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

export function StatusBarAgents({
  summary,
  items,
  projectKeys,
  onNavigate,
}: {
  summary: AgentActivitySummary;
  items: StatusBarAgentItem[];
  projectKeys: Record<string, string>;
  onNavigate: (item: StatusBarAgentItem) => void;
}) {
  const { client } = useConsoleApi();
  const [labelsByTaskId, setLabelsByTaskId] = useState<Record<string, string>>(
    {},
  );

  const taskIdsKey = items.map((item) => item.taskId).join("|");

  useEffect(() => {
    let cancelled = false;
    const missing = items
      .map((item) => item.taskId)
      .filter((taskId) => !labelsByTaskId[taskId]);
    if (missing.length === 0) return;

    void (async () => {
      const entries = await Promise.all(
        missing.map(async (taskId) => {
          try {
            const task = await client.requestJson<Task>(
              `/api/v1/tasks/${encodeURIComponent(taskId)}`,
            );
            const projectKey = task.projectId
              ? projectKeys[task.projectId]
              : null;
            const displayId =
              projectKey && task.number
                ? formatTaskDisplayId(projectKey, task.number)?.trim()
                : null;
            const taskTitle = task.title?.trim() || "";
            const label =
              displayId && taskTitle
                ? `${displayId} · ${taskTitle}`
                : displayId || taskTitle || taskId.slice(0, 8);
            return [taskId, label] as const;
          } catch {
            return [taskId, taskId.slice(0, 8)] as const;
          }
        }),
      );
      if (cancelled) return;
      setLabelsByTaskId((current) => {
        const next = { ...current };
        for (const [taskId, label] of entries) next[taskId] = label;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit labelsByTaskId — we only fetch missing ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, projectKeys, taskIdsKey]);

  const menuItems = useMemo((): StatusBarHoverItem[] => {
    return items.map((item) => ({
      id: item.taskId,
      title: labelsByTaskId[item.taskId] ?? item.projectLabel,
      subtitle: item.projectLabel,
      meta: activityLabel(item.activity),
      onSelect: () => onNavigate(item),
    }));
  }, [items, labelsByTaskId, onNavigate]);

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
