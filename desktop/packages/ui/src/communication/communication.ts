import {
  findInboxItemBySlugOrId,
  getInboxItemRouteSlug,
  getInboxTaskRouteSlugForTask,
  type InboxListItem,
} from "../inbox/inbox-items.js";
import { withEmailListContext } from "../email/email.js";

export const COMMUNICATION_LIST_PATH = "/communication";

export function isCommunicationSectionPath(pathname: string): boolean {
  return (
    pathname === COMMUNICATION_LIST_PATH ||
    pathname.startsWith(`${COMMUNICATION_LIST_PATH}/`)
  );
}

export function getCommunicationHref(itemId?: string | null): string {
  const id = itemId?.trim();
  return id ? `${COMMUNICATION_LIST_PATH}/${encodeURIComponent(id)}` : COMMUNICATION_LIST_PATH;
}

export function getSelectedCommunicationSlugFromPathname(
  pathname: string,
): string | null {
  if (!pathname.startsWith(`${COMMUNICATION_LIST_PATH}/`)) return null;
  const slug = pathname.slice(`${COMMUNICATION_LIST_PATH}/`.length).split("/")[0];
  return slug ? decodeURIComponent(slug) : null;
}

/** Support-task detail href under Communication (not Inbox). */
export function getCommunicationTaskRouteHref(input: {
  number?: number | null;
  projectKey?: string | null;
  contactKey?: string | null;
  taskId?: string | null;
}): string {
  if (input.number == null || !Number.isFinite(input.number)) {
    return input.taskId
      ? getCommunicationHref(input.taskId)
      : COMMUNICATION_LIST_PATH;
  }
  return getCommunicationHref(
    getInboxTaskRouteSlugForTask({
      number: input.number,
      projectKey: input.projectKey ?? undefined,
      contactKey: input.contactKey ?? undefined,
      taskId: input.taskId ?? undefined,
    }),
  );
}

export function getCommunicationItemHref(
  item: InboxListItem,
  items: readonly InboxListItem[] = [],
): string {
  if (item.kind === "email") {
    return withEmailListContext(
      `/email/${encodeURIComponent(item.inboxId)}/${encodeURIComponent(item.messageId)}`,
      "communication",
    );
  }
  if (item.kind !== "task") {
    return COMMUNICATION_LIST_PATH;
  }

  const slug = getInboxItemRouteSlug(item);
  const hasSlugCollision =
    items.length > 0 &&
    items.some(
      (other) => other.id !== item.id && getInboxItemRouteSlug(other) === slug,
    );
  if (hasSlugCollision) {
    return getCommunicationHref(item.id);
  }
  return getCommunicationTaskRouteHref({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
    taskId: item.id,
  });
}

export function buildCommunicationItemHrefById(
  items: readonly InboxListItem[],
): Map<string, string> {
  const slugCounts = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== "task") continue;
    const slug = getInboxItemRouteSlug(item);
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }

  const hrefById = new Map<string, string>();
  for (const item of items) {
    if (item.kind === "email") {
      hrefById.set(
        item.id,
        withEmailListContext(
          `/email/${encodeURIComponent(item.inboxId)}/${encodeURIComponent(item.messageId)}`,
          "communication",
        ),
      );
      continue;
    }
    if (item.kind !== "task") {
      hrefById.set(item.id, COMMUNICATION_LIST_PATH);
      continue;
    }
    const slug = getInboxItemRouteSlug(item);
    hrefById.set(
      item.id,
      (slugCounts.get(slug) ?? 0) > 1
        ? getCommunicationHref(item.id)
        : getCommunicationTaskRouteHref({
            number: item.number,
            projectKey: item.projectKey,
            contactKey: item.contactKey,
            taskId: item.id,
          }),
    );
  }
  return hrefById;
}

export function getFirstCommunicationItemHref(
  items: readonly InboxListItem[],
): string | null {
  const first = items[0];
  if (!first) return null;
  return getCommunicationItemHref(first, items);
}

export function findCommunicationItemBySlugOrId(
  items: readonly InboxListItem[],
  slugOrId: string,
): InboxListItem | null {
  return findInboxItemBySlugOrId(items, slugOrId) ?? null;
}
