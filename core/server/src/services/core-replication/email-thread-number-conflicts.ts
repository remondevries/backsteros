/**
 * Email thread display-number forks (Round 4, mirrors task-number-conflicts).
 *
 * `email_threads_workspace_number_idx` is UNIQUE (workspace_id, number). Both
 * cores can hand out the same number to different threads (offline ingest,
 * AgentMail webhook on each core). Thread ids are referenced by comments, so
 * neither row may be deleted or dead-lettered. Instead the earlier-created
 * thread keeps the number (tie → smaller id) and the other moves to
 * max(workspace)+1, deterministically on both cores; updated_at is bumped so
 * the new number replicates.
 *
 * A collision on (workspace_id, inbox_id, thread_key) is a different problem —
 * the same mail thread forked into two ids — and stays a dead letter.
 */

import { readPgError } from "./soft-unique-conflicts.js";
import {
  taskNumberKeeper,
  type TaskNumberCollisionMeta,
} from "./task-number-conflicts.js";

export const EMAIL_THREAD_NUMBER_UNIQUE_CONSTRAINT =
  "email_threads_workspace_number_idx";

/** entity_counters key used by nextEmailThreadNumber. */
export const EMAIL_THREAD_COUNTER_ENTITY = "email";
export const EMAIL_THREAD_COUNTER_SCOPE = "__workspace__";

export type EmailThreadNumberCollisionMeta = TaskNumberCollisionMeta;

/**
 * Which of two colliding threads keeps the display number. Symmetric:
 * emailThreadNumberKeeper(a, b) === emailThreadNumberKeeper(b, a).
 */
export function emailThreadNumberKeeper(
  a: EmailThreadNumberCollisionMeta,
  b: EmailThreadNumberCollisionMeta,
): EmailThreadNumberCollisionMeta {
  return taskNumberKeeper(a, b);
}

export function isEmailThreadNumberUniqueViolation(error: unknown): boolean {
  const info = readPgError(error);
  return (
    info?.code === "23505" &&
    info.constraint === EMAIL_THREAD_NUMBER_UNIQUE_CONSTRAINT
  );
}
