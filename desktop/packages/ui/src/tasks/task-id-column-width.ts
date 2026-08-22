import type { CSSProperties } from "react";

import { getTaskDisplayId } from "./task-display-id.js";

/** Fallback when no display ids are available (e.g. empty list). */
export const DEFAULT_TASK_ID_COLUMN_CH = 5;

/**
 * Extra `ch` so letterforms / subpixel rounding don't clip the last digit.
 * `ch` is the advance of "0"; keys can measure a hair wider in ui-monospace.
 */
export const TASK_ID_COLUMN_CH_SLACK = 1;

export type TaskIdColumnWidthSource = {
  number?: number | null;
  projectId?: string | null;
  projectKey?: string | null;
  contactId?: string | null;
};

/** Digit count for a positive task number (`9` → 1, `10` → 2, `100` → 3). */
export function taskNumberDigitCount(taskNumber: number): number {
  if (!Number.isFinite(taskNumber) || taskNumber < 1) {
    return 1;
  }
  return Math.floor(Math.log10(taskNumber)) + 1;
}

/**
 * Monospace `ch` width for the task-id column so titles align across rows.
 *
 * Uses the widest display id among `tasks` (project key + hyphen + digits), so
 * the column grows when the highest number gains a digit (99 → 100 → 1000).
 *
 * Pass all workspace tasks for a global list; pass one project's tasks for a
 * project-scoped list.
 */
export function computeTaskDisplayIdColumnCh(
  tasks: ReadonlyArray<TaskIdColumnWidthSource>,
): number {
  let max = DEFAULT_TASK_ID_COLUMN_CH;
  for (const task of tasks) {
    const displayId = getTaskDisplayId(
      {
        number: task.number,
        projectId: task.projectId,
        contactId: task.contactId,
      },
      task.projectKey,
    );
    if (displayId) {
      max = Math.max(max, displayId.length);
    }
  }
  return max + TASK_ID_COLUMN_CH_SLACK;
}

/** Inline style that sets `--task-id-column-ch` for `.task-item-row__id`. */
export function taskIdColumnCssVars(columnCh: number): CSSProperties {
  return {
    ["--task-id-column-ch" as string]: columnCh,
  };
}
