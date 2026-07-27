import { createElement, type ReactNode } from "react";
import {
  AgentActivityIcon,
  migrateLegacyTaskStatus,
  TaskStatusWorkingPulse,
} from "@backsteros/ui";

import type { DesktopAgentStatusContextValue } from "./agent-status-context";

type TaskAgentBinding = {
  id: string;
  projectId?: string | null;
  agentChatId?: string | null;
  status?: string | null;
};

/**
 * Whether list/detail UI should show agent-working animations for this task.
 * On Hold (and terminal statuses) always read as stopped — even if the PTY
 * still reports working while waiting for input.
 */
export function isTaskAgentWorkingForUi(
  task: { id: string; status?: string | null },
  agentStatus: Pick<DesktopAgentStatusContextValue, "isTaskWorking"> | null,
): boolean {
  const status = migrateLegacyTaskStatus(task.status ?? "ready_to_start");
  if (
    status === "on_hold" ||
    status === "completed" ||
    status === "canceled" ||
    status === "duplicated"
  ) {
    return false;
  }
  return agentStatus?.isTaskWorking(task.id) ?? false;
}

/**
 * Title-trailing indicator for task rows (inbox / project tasks).
 * Bound/open agent → robot glyph (also while working). Working pulse only when
 * it is not already shown on the status icon.
 */
export function renderTaskAgentTitleTrailing(options: {
  taskId: string;
  agentChatId?: string | null;
  taskStatus?: string | null;
  agentStatus: Pick<
    DesktopAgentStatusContextValue,
    "isTaskWorking" | "isTaskAgentOpen"
  > | null;
  /**
   * When true, the status icon already shows the working pulse — omit the
   * trailing loader so it isn't duplicated. The robot badge still shows.
   */
  workingShownOnStatusIcon?: boolean;
}): ReactNode {
  const {
    taskId,
    agentChatId,
    taskStatus,
    agentStatus,
    workingShownOnStatusIcon = false,
  } = options;
  if (!agentStatus) return null;
  const working = isTaskAgentWorkingForUi(
    { id: taskId, status: taskStatus },
    agentStatus,
  );
  const agentBound =
    agentStatus.isTaskAgentOpen(taskId) || Boolean(agentChatId?.trim());
  // Prefer the robot whenever a session is bound/open — including while
  // working. Non-codebase chat marks working optimistically; hiding the robot
  // in that window made default/general tasks look unbound.
  if (agentBound) {
    return createElement(AgentActivityIcon, {
      size: 9,
      className: "task-item-row__agent-badge-icon",
    });
  }
  if (working && !workingShownOnStatusIcon) {
    return createElement(TaskStatusWorkingPulse, {
      size: 14,
      "aria-label": "Agent working",
    });
  }
  return null;
}

/** Project ids that currently have at least one working agent task. */
export function buildWorkingProjectIdSet(
  tasks: readonly TaskAgentBinding[],
  workingTaskIds: ReadonlySet<string>,
): ReadonlySet<string> {
  if (workingTaskIds.size === 0) return new Set();
  const projectIds = new Set<string>();
  for (const task of tasks) {
    if (!workingTaskIds.has(task.id)) continue;
    const projectId = task.projectId?.trim();
    if (projectId) projectIds.add(projectId);
  }
  return projectIds;
}
