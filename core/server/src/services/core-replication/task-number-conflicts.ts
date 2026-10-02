/**
 * Task display-number forks (OS-70).
 *
 * `tasks_workspace_scope_number_unique` is (workspace, scope, number) WHERE
 * legacy_source IS NULL — it is not partial on deleted_at. Two cores can assign
 * the same number to different task ids (habit spawn, offline create, etc.).
 * Soft-deleting the other row loses a live task; when both are already soft-
 * deleted the soft-unique heal cannot clear the index and the row dead-letters.
 *
 * Instead: keep the number on the earlier-created row (tie → smaller id) and
 * move the other to max(scope)+1. Deterministic so both cores renumber the
 * same id; bump updated_at so the new number replicates.
 */

import { readPgError } from "./soft-unique-conflicts.js";

export const TASK_NUMBER_UNIQUE_CONSTRAINT =
  "tasks_workspace_scope_number_unique";

export type TaskNumberCollisionMeta = {
  id: string;
  createdAt: Date;
};

/**
 * Which of two colliding tasks keeps the display number. Symmetric:
 * taskNumberKeeper(a, b) === taskNumberKeeper(b, a).
 */
export function taskNumberKeeper(
  a: TaskNumberCollisionMeta,
  b: TaskNumberCollisionMeta,
): TaskNumberCollisionMeta {
  const aMs = a.createdAt.getTime();
  const bMs = b.createdAt.getTime();
  if (Number.isFinite(aMs) && Number.isFinite(bMs)) {
    if (aMs < bMs) return a;
    if (aMs > bMs) return b;
  } else if (Number.isFinite(aMs)) {
    return a;
  } else if (Number.isFinite(bMs)) {
    return b;
  }
  return a.id < b.id ? a : b;
}

export function isTaskNumberUniqueViolation(error: unknown): boolean {
  const info = readPgError(error);
  return (
    info?.code === "23505" && info.constraint === TASK_NUMBER_UNIQUE_CONSTRAINT
  );
}

/** Scope id used by entity_counters for tasks (matches nextTaskNumber). */
export function taskNumberScopeId(
  projectId: string | null | undefined,
  contactId: string | null | undefined,
): string {
  if (projectId) return `project:${projectId}`;
  if (contactId) return `contact:${contactId}`;
  return "__inbox__";
}
