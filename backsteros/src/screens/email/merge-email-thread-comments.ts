import type { EmailThreadComment } from "@backsteros/contracts";

/**
 * Keep optimistic / just-posted comments when an open-thread refresh returns
 * before the server list includes them (task/meeting cards vanishing mid-flight).
 * Drop ids in `excludeIds` (local deletes) so ghosts cannot reappear via merge.
 */
export function mergeEmailThreadComments(input: {
  local: readonly EmailThreadComment[];
  server: readonly EmailThreadComment[];
  excludeIds?: ReadonlySet<string> | readonly string[] | null;
}): EmailThreadComment[] {
  const { local, server, excludeIds } = input;
  const excluded =
    excludeIds instanceof Set
      ? excludeIds
      : Array.isArray(excludeIds) && excludeIds.length > 0
        ? new Set(excludeIds)
        : null;
  const serverVisible = excluded
    ? server.filter((comment) => !excluded.has(comment.id))
    : server;
  const serverIds = new Set(serverVisible.map((comment) => comment.id));
  const pending = local.filter(
    (comment) =>
      !serverIds.has(comment.id) && !(excluded?.has(comment.id) ?? false),
  );
  if (pending.length === 0) {
    if (
      local.length === serverVisible.length &&
      local.every((comment, index) => comment.id === serverVisible[index]?.id)
    ) {
      return local as EmailThreadComment[];
    }
    return [...serverVisible];
  }
  return [...pending, ...serverVisible];
}
