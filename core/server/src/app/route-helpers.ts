/**
 * Shared HTTP helpers for split route modules (OS-73).
 */
import type { Context } from "hono";

import type { AuthContext } from "../middleware/auth.js";
import { requireScope } from "../middleware/auth.js";
import {
  ListQueryError,
} from "../lib/list-query.js";
import { TaskFilterError } from "../lib/task-filters.js";
import {
  isWorkspaceUpdatedKind,
  publishEntityWorkspaceUpdated,
} from "../lib/workspace-events.js";
import { notifyPeerOfDocumentWrite } from "../services/core-replication/nudge.js";

export function can(auth: AuthContext, scope: Parameters<typeof requireScope>[0]) {
  return requireScope(scope)(auth);
}


export function unauthorized() {
  return { error: "Unauthorized", code: "unauthorized" as const };
}


export function forbidden() {
  return { error: "Insufficient scope", code: "forbidden" as const };
}


export function notFound(resource: string) {
  return { error: `${resource} not found`, code: "not_found" as const };
}


export function listQueryErrorBody(error: ListQueryError | TaskFilterError) {
  return {
    error: error.message,
    code: error.code,
    field: error.field,
  };
}


export function getAuth(c: Context): AuthContext {
  return c.get("auth");
}


export function nudgePeerEntityLive(
  auth: AuthContext,
  entity: string,
  entityId: string,
  operation: "upsert" | "delete" = "upsert",
): void {
  if (isWorkspaceUpdatedKind(entity) && entity !== "task_comment") {
    publishEntityWorkspaceUpdated(auth.workspaceId, entity, entityId, {
      operation,
    });
  }
  notifyPeerOfDocumentWrite({
    workspaceId: auth.workspaceId,
    reason: entity,
    entity,
    entityId,
    operation,
  });
}

