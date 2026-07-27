import type { LetterWithProjectSummary } from "@/lib/db/queries/letters";
import type { TaskWithContextSummary } from "@/lib/db/queries/tasks";
import {
  getInboxTaskRouteHref,
  getInboxTaskRouteSlugForTask,
} from "@/lib/entity-route-hrefs";
import { encodeLetterSlug } from "@/lib/entity-slugs";
import { toTimestampMs } from "@/lib/sync/timestamps";

export type InboxTaskListItem = {
  kind: "task";
  id: string;
  title: string;
  status: string;
  number: number;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  contactKey: string | null;
  priority: number;
  dueDate: number | null;
  updatedAt: number;
};

export type InboxLetterListItem = {
  kind: "letter";
  id: string;
  title: string;
  number: number;
  icon: string | null;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  projectIcon: string | null;
  updatedAt: number;
};

export type InboxListItem = InboxTaskListItem | InboxLetterListItem;

function mapInboxTask(task: TaskWithContextSummary): InboxTaskListItem {
  return {
    kind: "task",
    id: task.id,
    title: task.title,
    status: task.status,
    number: task.number,
    projectId: task.project?.id ?? null,
    projectKey: task.project?.key ?? null,
    projectName: task.project?.name ?? null,
    projectIcon: task.project?.icon ?? null,
    contactKey: task.contact?.key ?? null,
    priority: task.priority,
    dueDate: task.dueDate != null ? toTimestampMs(task.dueDate) : null,
    updatedAt: toTimestampMs(task.updatedAt),
  };
}

function mapInboxLetter(letter: LetterWithProjectSummary): InboxLetterListItem {
  return {
    kind: "letter",
    id: letter.id,
    title: letter.title,
    number: letter.number ?? 0,
    icon: letter.icon ?? null,
    projectId: letter.project?.id ?? null,
    projectKey: letter.project?.key ?? null,
    projectName: letter.project?.name ?? null,
    projectIcon: letter.project?.icon ?? null,
    updatedAt: toTimestampMs(letter.updatedAt),
  };
}

export function buildInboxTaskListItem(input: {
  id: string;
  title: string;
  number: number;
  status: string;
  priority?: number;
  dueDate?: number | null;
  updatedAt?: number;
}): InboxTaskListItem {
  return {
    kind: "task",
    id: input.id,
    title: input.title,
    status: input.status,
    number: input.number,
    projectId: null,
    projectKey: null,
    projectName: null,
    projectIcon: null,
    contactKey: null,
    priority: input.priority ?? 0,
    dueDate: input.dueDate ?? null,
    updatedAt: input.updatedAt ?? Date.now(),
  };
}

export function buildInboxListItems(
  tasks: TaskWithContextSummary[],
  letters: LetterWithProjectSummary[],
  options?: { sortByUpdatedAt?: boolean },
): InboxListItem[] {
  const items: InboxListItem[] = [
    ...tasks.map(mapInboxTask),
    ...letters.map(mapInboxLetter),
  ];

  // Side-panel lists should preserve API/PowerSync order (`sort_order`).
  // Sorting by `updatedAt` makes property edits jump the row to the top.
  if (options?.sortByUpdatedAt === false) {
    return items;
  }

  return items.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function getInboxItemRouteSlug(item: InboxListItem): string {
  if (item.kind === "letter") {
    return encodeLetterSlug(item.number);
  }

  return getInboxTaskRouteSlugForTask({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
  });
}

/**
 * Inbox list href. When two items share a display slug (e.g. both `in-10`),
 * use the task id so selection/highlight can resolve uniquely.
 */
export function getInboxItemHref(
  item: InboxListItem,
  items: readonly InboxListItem[] = [],
): string {
  if (item.kind === "letter") {
    return `/letters/${item.id}`;
  }

  const slug = getInboxItemRouteSlug(item);
  const hasSlugCollision = items.some(
    (other) => other.id !== item.id && getInboxItemRouteSlug(other) === slug,
  );

  if (hasSlugCollision) {
    return `/inbox/${item.id}`;
  }

  return getInboxTaskRouteHref({
    number: item.number,
    projectKey: item.projectKey,
    contactKey: item.contactKey,
  });
}

/**
 * Href for the first inbox list item, using the same order as the side panel
 * (`sort_order` / source order) unless `sortByUpdatedAt` is enabled.
 */
export function getFirstInboxItemHref(
  tasks: TaskWithContextSummary[],
  letters: LetterWithProjectSummary[],
  options: { sortByUpdatedAt?: boolean } = { sortByUpdatedAt: false },
): string | undefined {
  const items = buildInboxListItems(tasks, letters, options);
  const first = items[0];
  return first ? getInboxItemHref(first, items) : undefined;
}

export function getFirstInboxItemSlug(
  tasks: TaskWithContextSummary[],
  letters: LetterWithProjectSummary[],
  options: { sortByUpdatedAt?: boolean } = { sortByUpdatedAt: false },
): string | undefined {
  const href = getFirstInboxItemHref(tasks, letters, options);
  if (!href) return undefined;
  if (href.startsWith("/inbox/")) return href.slice("/inbox/".length);
  if (href.startsWith("/letters/")) return href.slice("/letters/".length);
  return undefined;
}

/**
 * Keep inbox row order stable across property updates that bump `updatedAt`.
 * New items are appended in source order; removed ids drop out.
 * An empty `items` snapshot is treated as transient — previous order is kept.
 */
export function mergeInboxListOrder(
  previousOrderIds: readonly string[],
  items: readonly InboxListItem[],
): string[] {
  if (items.length === 0) {
    return [...previousOrderIds];
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const next: string[] = [];
  const seen = new Set<string>();

  for (const id of previousOrderIds) {
    if (!byId.has(id) || seen.has(id)) {
      continue;
    }
    next.push(id);
    seen.add(id);
  }

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    next.push(item.id);
    seen.add(item.id);
  }

  return next;
}

export function applyInboxListOrder(
  items: readonly InboxListItem[],
  orderIds: readonly string[],
): InboxListItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: InboxListItem[] = [];
  const seen = new Set<string>();

  for (const id of orderIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) {
      continue;
    }
    ordered.push(item);
    seen.add(id);
  }

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    ordered.push(item);
  }

  return ordered;
}
