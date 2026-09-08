import type { TaskActivity, TaskComment } from "@backsteros/contracts";
import { formatTrackedDuration } from "@backsteros/contracts";

import { isAgentHoldCommentBody } from "./agent-hold-comment";
import { formatTaskDueMetaLabel } from "./task-due-date";
import { getTaskPriorityLabel } from "./task-priority";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "./task-status";

/** Format agent turn duration for activity timeline rows. */
export function formatActivityDurationMs(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return seconds > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
        ? `${hours}h ${minutes}m`
        : `${hours}h`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** Compact token count for activity timeline rows. */
export function formatActivityTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 10_000) {
    return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS_ORDER as readonly string[]).includes(value);
}

function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  if (isTaskStatus(value)) return getTaskStatusLabel(value);
  return getTaskStatusLabel(migrateLegacyTaskStatus(value));
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function priorityLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return getTaskPriorityLabel(value);
  }
  return "No priority";
}

function dueDateLabel(value: unknown): string {
  if (value == null) return "No due date";
  if (typeof value !== "string" && typeof value !== "number") {
    return "No due date";
  }
  return formatTaskDueMetaLabel(value) ?? "No due date";
}

function namedValue(
  id: unknown,
  name: unknown,
  fallback: string,
): string {
  const explicit = asOptionalString(name);
  if (explicit) return explicit;
  if (id == null) return fallback;
  return fallback;
}

/** Resolve duration + token totals from an agent_worked activity row. */
export function agentWorkTotals(activity: TaskActivity): {
  durationMs: number;
  totalTokens: number | null;
} {
  const durationMs = asNonNegativeInt(activity.data.durationMs) ?? 0;
  const explicit = asNonNegativeInt(activity.data.totalTokens);
  if (explicit != null) {
    return { durationMs, totalTokens: explicit };
  }
  const parts = [
    asNonNegativeInt(activity.data.inputTokens),
    asNonNegativeInt(activity.data.outputTokens),
    asNonNegativeInt(activity.data.cacheReadTokens),
    asNonNegativeInt(activity.data.cacheWriteTokens),
  ].filter((value): value is number => value != null);
  return {
    durationMs,
    totalTokens:
      parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null,
  };
}

/** Plain-text activity line for React Native (actor name emphasized by caller). */
export function formatActivityMessage(activity: TaskActivity): string {
  const name = activity.actorName;
  if (activity.type === "created") {
    return `${name} created this task`;
  }
  if (activity.type === "status_changed") {
    return `${name} changed status from ${statusLabel(activity.data.from)} to ${statusLabel(activity.data.to)}`;
  }
  if (activity.type === "assignee_changed") {
    const toName = namedValue(activity.data.to, activity.data.toName, "someone");
    if (activity.data.to == null) {
      return `${name} unassigned this task`;
    }
    if (activity.data.from == null) {
      return `${name} assigned this task to ${toName}`;
    }
    return `${name} reassigned this task to ${toName}`;
  }
  if (activity.type === "priority_changed") {
    return `${name} changed priority from ${priorityLabel(activity.data.from)} to ${priorityLabel(activity.data.to)}`;
  }
  if (activity.type === "due_date_changed") {
    return `${name} changed due date from ${dueDateLabel(activity.data.from)} to ${dueDateLabel(activity.data.to)}`;
  }
  if (activity.type === "project_changed") {
    const fromName = namedValue(
      activity.data.from,
      activity.data.fromName,
      "No project",
    );
    const toName = namedValue(
      activity.data.to,
      activity.data.toName,
      "No project",
    );
    return `${name} moved this task from ${fromName} to ${toName}`;
  }
  if (activity.type === "agent_worked") {
    const { durationMs, totalTokens } = agentWorkTotals(activity);
    const duration = formatActivityDurationMs(durationMs);
    if (totalTokens != null && totalTokens > 0) {
      return `${name} worked for ${duration} · ${formatActivityTokenCount(totalTokens)} tokens`;
    }
    return `${name} worked for ${duration}`;
  }
  if (activity.type === "timer_started") {
    return `${name} started the timer on this task`;
  }
  if (activity.type === "timer_stopped") {
    const durationSeconds =
      typeof activity.data.durationSeconds === "number" &&
      Number.isFinite(activity.data.durationSeconds)
        ? Math.max(0, Math.round(activity.data.durationSeconds))
        : 0;
    return `${name} tracked ${formatTrackedDuration(durationSeconds)} on this task`;
  }
  return `${name} updated this task`;
}

export type GroupedActivity = {
  activity: TaskActivity;
  count: number;
  at: string;
  /** Individual agent_worked rows when consecutive turns were collapsed. */
  children?: TaskActivity[];
};

/** Merge consecutive agent_worked rows into one parent with summed stats. */
export function mergeAgentWorkedActivities(
  activities: TaskActivity[],
): TaskActivity {
  if (activities.length === 0) {
    throw new Error("mergeAgentWorkedActivities requires at least one activity");
  }
  if (activities.length === 1) {
    return activities[0]!;
  }

  let durationMs = 0;
  let totalTokens = 0;
  let hasTokens = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let hasInput = false;
  let hasOutput = false;
  let hasCacheRead = false;
  let hasCacheWrite = false;

  for (const activity of activities) {
    const totals = agentWorkTotals(activity);
    durationMs += totals.durationMs;
    if (totals.totalTokens != null) {
      totalTokens += totals.totalTokens;
      hasTokens = true;
    }
    const input = asNonNegativeInt(activity.data.inputTokens);
    if (input != null) {
      inputTokens += input;
      hasInput = true;
    }
    const output = asNonNegativeInt(activity.data.outputTokens);
    if (output != null) {
      outputTokens += output;
      hasOutput = true;
    }
    const cacheRead = asNonNegativeInt(activity.data.cacheReadTokens);
    if (cacheRead != null) {
      cacheReadTokens += cacheRead;
      hasCacheRead = true;
    }
    const cacheWrite = asNonNegativeInt(activity.data.cacheWriteTokens);
    if (cacheWrite != null) {
      cacheWriteTokens += cacheWrite;
      hasCacheWrite = true;
    }
  }

  const latest = activities[activities.length - 1]!;
  const earliest = activities[0]!;

  return {
    ...latest,
    id: `group:${earliest.id}:${latest.id}`,
    createdAt: latest.createdAt,
    data: {
      durationMs,
      ...(hasTokens ? { totalTokens } : {}),
      ...(hasInput ? { inputTokens } : {}),
      ...(hasOutput ? { outputTokens } : {}),
      ...(hasCacheRead ? { cacheReadTokens } : {}),
      ...(hasCacheWrite ? { cacheWriteTokens } : {}),
    },
  };
}

/**
 * Collapse adjacent agent_worked entries (same type, uninterrupted) into one
 * parent row that can expand to show the individual turns.
 */
export function groupConsecutiveAgentWorked(
  items: GroupedActivity[],
): GroupedActivity[] {
  const out: GroupedActivity[] = [];
  let index = 0;

  while (index < items.length) {
    const current = items[index]!;
    if (current.activity.type !== "agent_worked") {
      out.push(current);
      index += 1;
      continue;
    }

    const run: GroupedActivity[] = [current];
    let next = index + 1;
    while (
      next < items.length &&
      items[next]!.activity.type === "agent_worked"
    ) {
      run.push(items[next]!);
      next += 1;
    }

    if (run.length === 1) {
      out.push(current);
    } else {
      const children = run.map((entry) => entry.activity);
      const merged = mergeAgentWorkedActivities(children);
      out.push({
        activity: merged,
        count: 1,
        at: run[run.length - 1]!.at,
        children,
      });
    }
    index = next;
  }

  return out;
}

const COALESCEABLE_ACTIVITY_TYPES = new Set<TaskActivity["type"]>([
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
]);

/** Skip agent/timer noise when looking back for a coalesce peer (matches API-by-type). */
const COALESCE_LOOKBACK_SKIP_TYPES = new Set<TaskActivity["type"]>([
  "agent_worked",
  "timer_started",
  "timer_stopped",
]);

/** Match API coalesce window — collapse rapid property edits in the feed. */
export const ACTIVITY_COALESCE_WINDOW_MS = 30_000;

function sameActivityActor(a: TaskActivity, b: TaskActivity): boolean {
  return a.actorUserId === b.actorUserId && a.actorContactId === b.actorContactId;
}

/**
 * Find a prior same-type/same-actor row to merge into.
 * Skips agent_worked / timer rows so status ping-pong around agent turns collapses.
 * Status changes have no time window (agent loops often exceed 30s); other
 * property edits keep the API 30s window.
 */
function findPropertyCoalesceIndex(
  out: GroupedActivity[],
  activity: TaskActivity,
  nextAt: number,
): number | null {
  if (!COALESCEABLE_ACTIVITY_TYPES.has(activity.type)) return null;
  const windowMs =
    activity.type === "status_changed"
      ? Number.POSITIVE_INFINITY
      : ACTIVITY_COALESCE_WINDOW_MS;

  for (let i = out.length - 1; i >= 0; i -= 1) {
    const entry = out[i]!;
    const prevAt = new Date(entry.at).getTime();
    if (
      Number.isFinite(prevAt) &&
      Number.isFinite(nextAt) &&
      nextAt - prevAt > windowMs
    ) {
      return null;
    }
    if (COALESCE_LOOKBACK_SKIP_TYPES.has(entry.activity.type)) {
      continue;
    }
    if (
      entry.activity.type === activity.type &&
      sameActivityActor(entry.activity, activity)
    ) {
      return i;
    }
    return null;
  }
  return null;
}

/**
 * Collapse property edits for the activity feed.
 * Expects chronological (oldest-first) activities.
 * Reverts (`from === to` after merge) are dropped — including in_progress↔in_review
 * ping-pong with agent_worked between them.
 */
export function coalescePropertyActivities(
  activities: readonly TaskActivity[],
): GroupedActivity[] {
  const out: GroupedActivity[] = [];
  for (const activity of activities) {
    const nextAt = new Date(activity.createdAt).getTime();
    const targetIndex = findPropertyCoalesceIndex(out, activity, nextAt);

    if (targetIndex != null) {
      const target = out[targetIndex]!;
      const from =
        "from" in target.activity.data
          ? target.activity.data.from
          : activity.data.from;
      const fromName =
        "fromName" in target.activity.data
          ? target.activity.data.fromName
          : activity.data.fromName;
      const mergedData: Record<string, unknown> = {
        ...activity.data,
        from,
        ...(fromName !== undefined ? { fromName } : {}),
      };
      if (mergedData.from === mergedData.to) {
        out.splice(targetIndex, 1);
        continue;
      }
      if (
        target.activity.data.from === mergedData.from &&
        target.activity.data.to === mergedData.to
      ) {
        target.count += 1;
        target.at = activity.createdAt;
        continue;
      }
      target.activity = {
        ...activity,
        data: mergedData,
      };
      target.at = activity.createdAt;
      continue;
    }

    if (activity.type === "status_changed") {
      let spamIndex: number | null = null;
      for (let i = out.length - 1; i >= 0; i -= 1) {
        const entry = out[i]!;
        if (COALESCE_LOOKBACK_SKIP_TYPES.has(entry.activity.type)) continue;
        if (
          entry.activity.type === "status_changed" &&
          sameActivityActor(entry.activity, activity) &&
          entry.activity.data.from === activity.data.from &&
          entry.activity.data.to === activity.data.to
        ) {
          spamIndex = i;
        }
        break;
      }
      if (spamIndex != null) {
        out[spamIndex]!.count += 1;
        out[spamIndex]!.at = activity.createdAt;
        continue;
      }
    }

    out.push({ activity, count: 1, at: activity.createdAt });
  }
  return out;
}

/** Most recent activity rows shown before "show more" expands the rest. */
export const VISIBLE_ACTIVITY_LIMIT = 5;

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export function isAgentComment(
  comment: Pick<
    TaskComment,
    "authorUserId" | "authorContactId" | "authorName" | "body"
  >,
): boolean {
  if (comment.authorContactId) return false;
  if (comment.authorUserId == null) return true;
  if (comment.authorName.trim() === "Agent") return true;
  return isAgentHoldCommentBody(comment.body);
}
