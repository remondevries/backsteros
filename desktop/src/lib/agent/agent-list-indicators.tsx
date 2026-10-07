import { createElement, type ReactNode } from "react";
import {
  AgentActivityIcon,
  migrateLegacyTaskStatus,
  TaskStatusWorkingPulse,
} from "@backsteros/ui";

import type { DesktopAgentStatusContextValue } from "./agent-status-context";

type AgentWorkingKind = "working" | "reviewing";

type TaskAgentBinding = {
  id: string;
  projectId?: string | null;
  agentChatId?: string | null;
  agentWorkingContactId?: string | null;
  agentWorkingKind?: AgentWorkingKind | null;
  status?: string | null;
};

function hasApiAgentWorkingMarker(task: {
  agentWorkingContactId?: string | null;
}): boolean {
  return Boolean(task.agentWorkingContactId?.trim());
}

function agentMarkerVerb(
  kind: AgentWorkingKind | null | undefined,
): "working" | "reviewing" {
  return kind === "reviewing" ? "reviewing" : "working";
}

/**
 * Whether list/detail UI should show agent-working animations for this task.
 * On Hold (and terminal statuses) always read as stopped — even if the PTY
 * still reports working while waiting for input.
 *
 * Coding runs use live presence / research marks; agents-API tasks use the
 * durable `agentWorkingContactId` marker (OS-96), including `reviewing`
 * while status is in_review.
 */
export function isTaskAgentWorkingForUi(
  task: {
    id: string;
    status?: string | null;
    agentWorkingContactId?: string | null;
  },
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
  if (hasApiAgentWorkingMarker(task)) return true;
  return agentStatus?.isTaskWorking(task.id) ?? false;
}

/**
 * Title-trailing indicator for task rows (inbox / project tasks).
 * Bound/open agent → robot glyph (also while working). Working pulse only when
 * it is not already shown on the status icon (`workingShownOnStatusIcon`).
 * Agents-API markers also show the agent display name when known (OS-96).
 */
export function renderTaskAgentTitleTrailing(options: {
  taskId: string;
  agentChatId?: string | null;
  agentWorkingContactId?: string | null;
  agentWorkingContactName?: string | null;
  agentWorkingKind?: AgentWorkingKind | null;
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
    agentWorkingContactId,
    agentWorkingContactName,
    agentWorkingKind,
    taskStatus,
    agentStatus,
    workingShownOnStatusIcon = false,
  } = options;
  const apiWorking = hasApiAgentWorkingMarker({ agentWorkingContactId });
  const working = isTaskAgentWorkingForUi(
    { id: taskId, status: taskStatus, agentWorkingContactId },
    agentStatus,
  );
  const agentBound =
    Boolean(agentStatus?.isTaskAgentOpen(taskId)) ||
    Boolean(agentChatId?.trim()) ||
    apiWorking;
  const name = agentWorkingContactName?.trim() || null;
  const verb = agentMarkerVerb(agentWorkingKind);

  if (agentBound) {
    return createElement(
      "span",
      {
        className: "task-item-row__agent-badge",
        title: name
          ? `${name} is ${verb}`
          : apiWorking
            ? `Agent ${verb}`
            : undefined,
      },
      createElement(AgentActivityIcon, {
        size: 9,
        className: "task-item-row__agent-badge-icon",
      }),
      name
        ? createElement(
            "span",
            { className: "task-item-row__agent-badge-name" },
            name,
          )
        : null,
    );
  }
  if (!agentStatus) return null;
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
  if (workingTaskIds.size === 0 && !tasks.some(hasApiAgentWorkingMarker)) {
    return new Set();
  }
  const projectIds = new Set<string>();
  for (const task of tasks) {
    const apiWorking = hasApiAgentWorkingMarker(task);
    if (!workingTaskIds.has(task.id) && !apiWorking) continue;
    if (
      !isTaskAgentWorkingForUi(
        {
          id: task.id,
          status: task.status,
          agentWorkingContactId: task.agentWorkingContactId,
        },
        { isTaskWorking: (id) => workingTaskIds.has(id) },
      )
    ) {
      continue;
    }
    const projectId = task.projectId?.trim();
    if (projectId) projectIds.add(projectId);
  }
  return projectIds;
}
