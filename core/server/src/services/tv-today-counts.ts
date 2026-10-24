import { and, eq, inArray, isNull } from "drizzle-orm";
import { getTaskDueDateYmd } from "@backsteros/contracts";
import type {
  TvTodayCountStatus,
  TvTodayCounts,
} from "@backsteros/contracts";
import { TV_TODAY_COUNT_STATUSES } from "@backsteros/contracts";

import { db } from "../db/index.js";
import { tasks } from "../db/schema.js";
import {
  DEFAULT_HABIT_TIMEZONE,
  formatYmdInTimeZone,
} from "../lib/habit-calendar.js";
import { listLiveTaskAgentPresence } from "./task-agent-presence.js";

export const TV_TODAY_COUNTS_TIMEZONE = DEFAULT_HABIT_TIMEZONE;

const OPEN_STATUS_SET = new Set<string>(TV_TODAY_COUNT_STATUSES);

export type TodayCountTaskRow = {
  id: string;
  status: string;
  dueDate: Date | string | null;
  agentWorkingContactId: string | null;
};

/**
 * Pure Island/TV split: due-today open tasks only.
 * Agent-active tasks (presence or durable agentWorkingContactId) count in
 * agentsWorking and are excluded from status buckets (so
 * dueTodayTotal = status sums + agentsWorking with no double-count).
 */
export function buildTvTodayCounts(input: {
  tasks: readonly TodayCountTaskRow[];
  agentActiveTaskIds: ReadonlySet<string>;
  now?: Date;
  timeZone?: string;
}): TvTodayCounts {
  const timeZone = input.timeZone ?? TV_TODAY_COUNTS_TIMEZONE;
  const todayYmd = formatYmdInTimeZone(input.now ?? new Date(), timeZone);
  const counts = new Map<TvTodayCountStatus, number>();
  let agentsWorking = 0;

  for (const task of input.tasks) {
    if (!OPEN_STATUS_SET.has(task.status)) continue;
    const dueYmd = getTaskDueDateYmd(task.dueDate, timeZone);
    if (dueYmd !== todayYmd) continue;

    const status = task.status as TvTodayCountStatus;
    const agentActive =
      input.agentActiveTaskIds.has(task.id) ||
      Boolean(task.agentWorkingContactId?.trim());

    if (agentActive) {
      agentsWorking += 1;
      continue;
    }

    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  const statuses: TvTodayCounts["statuses"] = [];
  let statusSum = 0;
  for (const status of TV_TODAY_COUNT_STATUSES) {
    const count = counts.get(status) ?? 0;
    if (count < 1) continue;
    statuses.push({ status, count });
    statusSum += count;
  }

  return {
    dueTodayTotal: statusSum + agentsWorking,
    statuses,
    agentsWorking,
  };
}

export async function getTvTodayCounts(
  workspaceId: string,
  options?: { now?: Date },
): Promise<TvTodayCounts> {
  const now = options?.now ?? new Date();
  const [rows, presence] = await Promise.all([
    db
      .select({
        id: tasks.id,
        status: tasks.status,
        dueDate: tasks.dueDate,
        agentWorkingContactId: tasks.agentWorkingContactId,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.deletedAt),
          inArray(tasks.status, [...TV_TODAY_COUNT_STATUSES]),
        ),
      ),
    listLiveTaskAgentPresence(workspaceId, { now }),
  ]);

  const agentActiveTaskIds = new Set(presence.map((row) => row.taskId));
  return buildTvTodayCounts({
    tasks: rows,
    agentActiveTaskIds,
    now,
  });
}
