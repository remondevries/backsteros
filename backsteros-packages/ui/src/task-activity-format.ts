import type { TaskActivity } from "@backsteros/contracts";

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

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
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
