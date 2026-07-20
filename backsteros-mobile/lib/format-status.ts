import { getTaskStatusLabel } from "./task-status";

/** @deprecated Prefer `getTaskStatusLabel` from `./task-status`. */
export function formatStatusLabel(status: string | null | undefined): string {
  return getTaskStatusLabel(status);
}
