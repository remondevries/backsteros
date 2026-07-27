import { createId } from "./create-id.js";

export function getCreateEntityFromQueryLabel(
  entityLabel: string,
  query: string,
): string | null {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return `Create ${entityLabel} “${trimmed}”`;
}

export const PENDING_ASSIGNABLE_ENTITY_PREFIX = "__pending__:";

export function createPendingAssignableId(): string {
  return `${PENDING_ASSIGNABLE_ENTITY_PREFIX}${createId()}`;
}

export function isPendingAssignableId(id: string): boolean {
  return id.startsWith(PENDING_ASSIGNABLE_ENTITY_PREFIX);
}
