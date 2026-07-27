import type { Task } from "@/lib/db/schema";

export type TaskWithContextSummary = Task & {
  project?: { id: string; key: string; name: string; icon: string | null } | null;
  contact?: { key: string } | null;
};

export function listInboxTasks(): TaskWithContextSummary[] {
  return [];
}

export function listTasksByProject(): Task[] {
  return [];
}

export function getProjectTaskProgressByProjectIds(
  projectIds: string[],
): Array<[string, { total: number; completed: number }]> {
  void projectIds;
  return [];
}

export function listTasksDueInRange(
  ...args: unknown[]
): TaskWithContextSummary[] {
  void args;
  return [];
}
