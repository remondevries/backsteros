import type { Letter } from "@/lib/db/schema";
import {
  getTaskStatusLabel,
  migrateLegacyTaskStatus,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "@/lib/task-status";

export type LetterStatusGroup = {
  status: TaskStatus;
  label: string;
  letters: Letter[];
};

export function groupLettersByStatus(letters: Letter[]): LetterStatusGroup[] {
  const buckets = new Map<TaskStatus, Letter[]>();

  for (const status of TASK_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const letter of letters) {
    const status = migrateLegacyTaskStatus(letter.status);
    buckets.get(status)?.push(letter);
  }

  return TASK_STATUS_ORDER.map((status) => ({
    status,
    label: getTaskStatusLabel(status),
    letters: (buckets.get(status) ?? []).sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    ),
  }));
}

/** First letter as shown in status-grouped side panel lists. */
export function getFirstLetterInListOrder(
  letters: Letter[],
): Letter | undefined {
  for (const group of groupLettersByStatus(letters)) {
    if (group.letters.length > 0) {
      return group.letters[0];
    }
  }

  return undefined;
}
