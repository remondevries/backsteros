import { encodeTaskSlug, getInboxTaskRouteHref } from "./inbox-items.js";
import { getScopedProjectTaskHref } from "./project-route-scope.js";

/**
 * Destination after duplicating a task — prefer pretty scoped routes, fall back
 * to the durable id under `/tasks`.
 */
export function resolveDuplicatedTaskHref(input: {
  id: string;
  number: number | null;
  projectKey?: string | null;
  contactKey?: string | null;
}): string {
  if (input.projectKey && input.number != null) {
    return getScopedProjectTaskHref(input.projectKey, input.number);
  }
  if (input.contactKey && input.number != null) {
    return `/contacts/${encodeURIComponent(input.contactKey)}/tasks/${encodeTaskSlug(input.contactKey, input.number)}`;
  }
  if (input.number != null) {
    return getInboxTaskRouteHref({ number: input.number });
  }
  return `/tasks/${input.id}`;
}
