import type { BacksterosTaskActivity } from "./types";

/**
 * Activity feed grouping matching BacksterOS desktop
 * (`coalescePropertyActivities` + `groupConsecutiveAgentWorked`).
 */

export type BacksterosGroupedActivity = {
  activity: BacksterosTaskActivity;
  count: number;
  at: string;
  /** Individual agent_worked rows when consecutive turns were collapsed. */
  children?: BacksterosTaskActivity[];
};

const COALESCEABLE_ACTIVITY_TYPES = new Set<string>([
  "status_changed",
  "assignee_changed",
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
]);

/** Skip agent/timer noise when looking back for a coalesce peer. */
const COALESCE_LOOKBACK_SKIP_TYPES = new Set<string>([
  "agent_worked",
  "timer_started",
  "timer_stopped",
]);

/** Match desktop / API coalesce window — collapse rapid property edits. */
export const BACKSTEROS_ACTIVITY_COALESCE_WINDOW_MS = 30_000;

function sameActivityActor(
  a: BacksterosTaskActivity,
  b: BacksterosTaskActivity,
): boolean {
  return a.actorUserId === b.actorUserId && a.actorContactId === b.actorContactId;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
}

function agentWorkTotals(activity: BacksterosTaskActivity): {
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
    totalTokens: parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null,
  };
}

/** Merge consecutive agent_worked rows into one parent with summed stats. */
export function mergeAgentWorkedActivities(
  activities: readonly BacksterosTaskActivity[],
): BacksterosTaskActivity {
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
 * Collapse adjacent agent_worked entries into one parent row.
 * Expects chronological (oldest-first) grouped items.
 */
export function groupConsecutiveAgentWorked(
  items: readonly BacksterosGroupedActivity[],
): BacksterosGroupedActivity[] {
  const out: BacksterosGroupedActivity[] = [];
  let index = 0;

  while (index < items.length) {
    const current = items[index]!;
    if (current.activity.type !== "agent_worked") {
      out.push(current);
      index += 1;
      continue;
    }

    const run: BacksterosGroupedActivity[] = [current];
    let next = index + 1;
    while (next < items.length && items[next]!.activity.type === "agent_worked") {
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

/**
 * Find a prior same-type/same-actor row to merge into.
 * Skips agent_worked / timer so status ping-pong around agent turns collapses.
 * Status has no time window; other property edits keep the 30s window.
 */
function findPropertyCoalesceIndex(
  out: BacksterosGroupedActivity[],
  activity: BacksterosTaskActivity,
  nextAt: number,
): number | null {
  if (!COALESCEABLE_ACTIVITY_TYPES.has(activity.type)) return null;
  const windowMs =
    activity.type === "status_changed"
      ? Number.POSITIVE_INFINITY
      : BACKSTEROS_ACTIVITY_COALESCE_WINDOW_MS;

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
 * Collapse rapid same-actor property edits (status, assignee, …).
 * Expects chronological (oldest-first) activities.
 * Reverts within a merge (`from === to`) are dropped.
 */
export function coalescePropertyActivities(
  activities: readonly BacksterosTaskActivity[],
): BacksterosGroupedActivity[] {
  const out: BacksterosGroupedActivity[] = [];
  for (const activity of activities) {
    const nextAt = new Date(activity.createdAt).getTime();
    const targetIndex = findPropertyCoalesceIndex(out, activity, nextAt);

    if (targetIndex != null) {
      const target = out[targetIndex]!;
      const from =
        "from" in target.activity.data ? target.activity.data.from : activity.data.from;
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

/**
 * Build a newest-first timeline: coalesce property edits, then group agent turns.
 */
export function buildBacksterosActivityTimeline(
  activities: readonly BacksterosTaskActivity[],
): BacksterosGroupedActivity[] {
  const chronological = [...activities].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const items = groupConsecutiveAgentWorked(coalescePropertyActivities(chronological));
  return [...items].sort((a, b) => b.at.localeCompare(a.at));
}
