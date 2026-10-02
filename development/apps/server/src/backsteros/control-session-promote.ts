/**
 * Best-effort BacksterOS task status sync for control-API-only sessions (no web UI).
 * Call only from non-GET handlers (POST start / message / promote) — never from
 * status or session-list GETs (OS-38 read-only).
 */
import {
  backsterosStatusForControlSession,
  type BacksterosControlSessionStatus,
} from "@t3tools/shared/backsterosTaskAutoPromote";

import { patchBacksterosControlTaskStatus } from "./control-backsteros.ts";

const lastPromotedStatus = new Map<string, BacksterosControlSessionStatus>();

export function resetControlSessionPromoteStateForTests(): void {
  lastPromotedStatus.clear();
}

/**
 * Map session lifecycle → BacksterOS status and PATCH when it changes.
 * `in_review` is only applied when the live task is already `in_progress`
 * (enforced inside {@link patchBacksterosControlTaskStatus}).
 */
export function maybePromoteBacksterosTaskForControlSession(
  taskId: string,
  sessionStatus: BacksterosControlSessionStatus,
): void {
  const previous = lastPromotedStatus.get(taskId);
  if (previous === sessionStatus) return;
  lastPromotedStatus.set(taskId, sessionStatus);

  const target = backsterosStatusForControlSession(sessionStatus);
  if (!target) return;
  void patchBacksterosControlTaskStatus(taskId, target);
}
