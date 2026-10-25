import { db } from "../../db/index.js";
import type { SyncEntity, SyncOperation } from "../../lib/sync-constants.js";
import type { HabitTaskSyncChange } from "../habits.js";
export type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export type SyncChange = {
  entity: SyncEntity;
  entity_id: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  updated_at: number;
};

export type SyncMutation = {
  id: string;
  changes: SyncChange[];
};

export type ApplySyncChangeOptions = {
  /**
   * When applying a habit update, collects task side-effects (renames, project
   * moves, ensure) so callers can emit task sync_events.
   */
  habitTaskChangesOut?: HabitTaskSyncChange[];
  /**
   * OS-49 / OS-42: peer sync_event replay — keep the event's updated_at, skip
   * vault folder side effects, and do not invent activity / auto-timer rows
   * (those replicate as their own entities).
   */
  peerReplay?: {
    updatedAt: Date;
  };
};
