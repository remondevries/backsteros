import type { TaskStatus } from "@/lib/task-status";

export type LocalCreatedTaskSnapshot = {
  taskId: string;
  taskNumber: number;
  title: string;
  status: TaskStatus;
  priority: number;
  dueDate: number | null;
  projectId: string | null;
  contactId: string | null;
  sortOrder: number;
  updatedAt: number;
};

export function rememberLocalCreatedTaskSnapshot(snapshot: LocalCreatedTaskSnapshot) {
  void snapshot;
}
export function takeLocalCreatedTaskSnapshot() {
  return null as LocalCreatedTaskSnapshot | null;
}
export function clearLocalCreatedTaskSnapshot() {}
