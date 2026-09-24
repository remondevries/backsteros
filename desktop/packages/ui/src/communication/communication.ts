import {
  findInboxItemBySlugOrId,
  getInboxItemRouteSlug,
  getInboxTaskRouteSlugForTask,
  type InboxListItem,
} from "../inbox/inbox-items.js";
import {
  parseEmailDraftPath,
  parseEmailMessagePath,
  withEmailListContext,
} from "../email/email.js";
import {
  isTaskStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../tasks/task-status.js";

export const COMMUNICATION_LIST_PATH = "/communication";

/** Query key for Everything / Email / Support channel on the list route. */
export const COMMUNICATION_CHANNEL_PARAM = "channel";

/** Query key for a specific mailbox under the Email channel. */
export const COMMUNICATION_INBOX_PARAM = "inbox";

/** Query key for a status folder under a mailbox (`?status=in_progress`). */
export const COMMUNICATION_STATUS_PARAM = "status";

export const communicationListFilters = [
  "all",
  "email",
  "whatsapp",
  "chat",
  "support",
] as const;

export type CommunicationListFilter =
  (typeof communicationListFilters)[number];

/** @deprecated Prefer CommunicationListFilter — same channel ids. */
export type CommunicationChannel = CommunicationListFilter;

export const DEFAULT_COMMUNICATION_LIST_FILTER: CommunicationListFilter =
  "all";

export const COMMUNICATION_LIST_FILTER_OPTIONS: ReadonlyArray<{
  value: CommunicationListFilter;
  label: string;
  shortcut?: string;
}> = [
  { value: "all", label: "Everything", shortcut: "1" },
  { value: "email", label: "E-mail", shortcut: "2" },
  { value: "whatsapp", label: "WhatsApp", shortcut: "3" },
  { value: "chat", label: "Chat", shortcut: "4" },
  { value: "support", label: "Support", shortcut: "5" },
];

export function communicationChannelLabel(
  channel: CommunicationListFilter,
): string {
  return (
    COMMUNICATION_LIST_FILTER_OPTIONS.find((option) => option.value === channel)
      ?.label ?? "Everything"
  );
}

export type CommunicationListContextOptions = {
  channel?: CommunicationListFilter | null;
  inboxId?: string | null;
  /** Status folder under a mailbox — only applied with `inboxId` + email. */
  status?: TaskStatus | null;
};

/** True when `?channel=` is present (vs defaulting to Everything). */
export function hasCommunicationChannelParam(
  search: string | null | undefined,
): boolean {
  const raw = search?.trim() ?? "";
  const params = new URLSearchParams(
    raw.startsWith("?") ? raw.slice(1) : raw,
  );
  return params.has(COMMUNICATION_CHANNEL_PARAM);
}

/** Append/replace `channel` (+ optional `inbox` / `status`) on any href. */
export function withCommunicationListContext(
  href: string,
  options: CommunicationListContextOptions = {},
): string {
  const channel =
    options.channel != null
      ? parseCommunicationListFilter(options.channel)
      : DEFAULT_COMMUNICATION_LIST_FILTER;
  const url = new URL(href, "http://local.invalid");
  url.searchParams.set(COMMUNICATION_CHANNEL_PARAM, channel);
  const inboxId = options.inboxId?.trim() || null;
  const status =
    options.status != null && isTaskStatus(options.status)
      ? options.status
      : null;
  if (inboxId && channel === "email") {
    url.searchParams.set(COMMUNICATION_INBOX_PARAM, inboxId);
    if (status) {
      url.searchParams.set(COMMUNICATION_STATUS_PARAM, status);
    } else {
      url.searchParams.delete(COMMUNICATION_STATUS_PARAM);
    }
  } else {
    url.searchParams.delete(COMMUNICATION_INBOX_PARAM);
    url.searchParams.delete(COMMUNICATION_STATUS_PARAM);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function isCommunicationListFilter(
  value: string,
): value is CommunicationListFilter {
  return (communicationListFilters as readonly string[]).includes(value);
}

export function parseCommunicationListFilter(
  value: string | null | undefined,
): CommunicationListFilter {
  const normalized = value?.trim().toLowerCase();
  if (normalized && isCommunicationListFilter(normalized)) {
    return normalized;
  }
  return DEFAULT_COMMUNICATION_LIST_FILTER;
}

/** Read `?channel=` from a search string (`""` or `"?channel=email"`). */
export function parseCommunicationChannelFromSearch(
  search: string | null | undefined,
): CommunicationListFilter {
  const raw = search?.trim() ?? "";
  const params = new URLSearchParams(
    raw.startsWith("?") ? raw.slice(1) : raw,
  );
  return parseCommunicationListFilter(
    params.get(COMMUNICATION_CHANNEL_PARAM),
  );
}

/** Read `?inbox=` mailbox id from a search string. */
export function parseCommunicationInboxIdFromSearch(
  search: string | null | undefined,
): string | null {
  const raw = search?.trim() ?? "";
  const params = new URLSearchParams(
    raw.startsWith("?") ? raw.slice(1) : raw,
  );
  const inboxId = params.get(COMMUNICATION_INBOX_PARAM)?.trim();
  return inboxId || null;
}

/** Read `?status=` folder status from a search string. */
export function parseCommunicationStatusFromSearch(
  search: string | null | undefined,
): TaskStatus | null {
  const raw = search?.trim() ?? "";
  const params = new URLSearchParams(
    raw.startsWith("?") ? raw.slice(1) : raw,
  );
  const status = params.get(COMMUNICATION_STATUS_PARAM)?.trim();
  if (!status || !isTaskStatus(status)) return null;
  return status;
}

/**
 * List route for a channel.
 * Pass `inboxId` to scope Email to one mailbox (`?channel=email&inbox=…`).
 * Pass `status` with `inboxId` for a status folder under that mailbox.
 * Everything uses explicit `?channel=all` so bare `/communication` can still
 * mean “restore last channel” from the section-entry store without stealing
 * Everything clicks.
 */
export function getCommunicationChannelHref(
  channel: CommunicationListFilter = DEFAULT_COMMUNICATION_LIST_FILTER,
  options?: { inboxId?: string | null; status?: TaskStatus | null },
): string {
  const inboxId = options?.inboxId?.trim() || null;
  const status =
    options?.status != null && isTaskStatus(options.status)
      ? options.status
      : null;
  if (inboxId) {
    const params = new URLSearchParams();
    params.set(COMMUNICATION_CHANNEL_PARAM, "email");
    params.set(COMMUNICATION_INBOX_PARAM, inboxId);
    if (status) {
      params.set(COMMUNICATION_STATUS_PARAM, status);
    }
    return `${COMMUNICATION_LIST_PATH}?${params.toString()}`;
  }
  return `${COMMUNICATION_LIST_PATH}?${COMMUNICATION_CHANNEL_PARAM}=${encodeURIComponent(channel)}`;
}

/**
 * Active channel for side-panel highlight:
 * prefer explicit `?channel=` (Everything → email/ticket keeps Everything);
 * else email detail → Email; support detail → Support; else list query.
 */
export function resolveActiveCommunicationChannel(input: {
  pathname: string;
  search?: string | null;
}): CommunicationListFilter {
  if (hasCommunicationChannelParam(input.search)) {
    // Mailbox-scoped list/detail always implies Email.
    if (parseCommunicationInboxIdFromSearch(input.search)) return "email";
    return parseCommunicationChannelFromSearch(input.search);
  }
  if (input.pathname.startsWith("/email/")) return "email";
  if (getSelectedCommunicationSlugFromPathname(input.pathname)) {
    return "support";
  }
  // Mailbox-scoped list always implies Email.
  if (parseCommunicationInboxIdFromSearch(input.search)) return "email";
  return parseCommunicationChannelFromSearch(input.search);
}

/** Active mailbox id for Email submenu highlight (list query or open email). */
export function resolveActiveCommunicationInboxId(input: {
  pathname: string;
  search?: string | null;
}): string | null {
  if (input.pathname.startsWith("/email/")) {
    return (
      parseEmailMessagePath(input.pathname)?.inboxId ??
      parseEmailDraftPath(input.pathname)?.inboxId ??
      null
    );
  }
  if (resolveActiveCommunicationChannel(input) !== "email") return null;
  return parseCommunicationInboxIdFromSearch(input.search);
}

/** Active status folder under a mailbox (list query only). */
export function resolveActiveCommunicationStatus(input: {
  pathname: string;
  search?: string | null;
}): TaskStatus | null {
  if (resolveActiveCommunicationInboxId(input) == null) return null;
  return parseCommunicationStatusFromSearch(input.search);
}

export function filterCommunicationListItems(
  items: readonly InboxListItem[],
  filter: CommunicationListFilter,
  inboxId?: string | null,
  status?: TaskStatus | null,
): InboxListItem[] {
  let next: InboxListItem[];
  if (filter === "email") {
    next = items.filter((item) => item.kind === "email");
  } else if (filter === "support") {
    next = items.filter((item) => item.kind === "task");
  } else if (filter === "whatsapp" || filter === "chat") {
    // Placeholder channels — wire real sources later.
    next = [];
  } else {
    // Everything: email + support (WhatsApp/Chat land here once hooked up).
    next = [...items];
  }
  const scopedInbox = inboxId?.trim() || null;
  if (scopedInbox) {
    next = next.filter(
      (item) => item.kind === "email" && item.inboxId === scopedInbox,
    );
  }
  const scopedStatus =
    status != null && isTaskStatus(status) ? status : null;
  if (!scopedStatus) return next;
  return next.filter((item) => {
    if (item.kind === "letter") return scopedStatus === "triage";
    return migrateLegacyTaskStatus(item.status ?? "triage") === scopedStatus;
  });
}

export function communicationListFilterEmptyLabel(
  filter: CommunicationListFilter,
  options?: { inboxLabel?: string | null },
): string {
  const inboxLabel = options?.inboxLabel?.trim();
  if (inboxLabel) return `No email in ${inboxLabel} yet.`;
  if (filter === "email") return "No email yet.";
  if (filter === "whatsapp") return "No WhatsApp conversations yet.";
  if (filter === "chat") return "No chats yet.";
  if (filter === "support") return "No support tickets yet.";
  return "No support tickets or email yet.";
}

export function isCommunicationSectionPath(pathname: string): boolean {
  return (
    pathname === COMMUNICATION_LIST_PATH ||
    pathname.startsWith(`${COMMUNICATION_LIST_PATH}/`)
  );
}

export function getCommunicationHref(
  itemId?: string | null,
  channel?: CommunicationListFilter | null,
  options?: { inboxId?: string | null; status?: TaskStatus | null },
): string {
  const id = itemId?.trim();
  const resolvedChannel = channel ?? DEFAULT_COMMUNICATION_LIST_FILTER;
  if (id) {
    return withCommunicationListContext(
      `${COMMUNICATION_LIST_PATH}/${encodeURIComponent(id)}`,
      {
        channel: resolvedChannel,
        inboxId: options?.inboxId,
        status: options?.status,
      },
    );
  }
  return getCommunicationChannelHref(resolvedChannel, options);
}

export function getSelectedCommunicationSlugFromPathname(
  pathname: string,
): string | null {
  if (!pathname.startsWith(`${COMMUNICATION_LIST_PATH}/`)) return null;
  const slug = pathname.slice(`${COMMUNICATION_LIST_PATH}/`.length).split("/")[0];
  return slug ? decodeURIComponent(slug) : null;
}

/** Support-task detail href under Communication (not Inbox). */
export function getCommunicationTaskRouteHref(
  input: {
    number?: number | null;
    projectKey?: string | null;
    contactKey?: string | null;
    taskId?: string | null;
  },
  listContext?: CommunicationListContextOptions,
): string {
  const channel = listContext?.channel ?? DEFAULT_COMMUNICATION_LIST_FILTER;
  const inboxId = listContext?.inboxId;
  const status = listContext?.status;
  if (input.number == null || !Number.isFinite(input.number)) {
    return input.taskId
      ? getCommunicationHref(input.taskId, channel, { inboxId, status })
      : getCommunicationChannelHref(channel, { inboxId, status });
  }
  return getCommunicationHref(
    getInboxTaskRouteSlugForTask({
      number: input.number,
      projectKey: input.projectKey ?? undefined,
      contactKey: input.contactKey ?? undefined,
      taskId: input.taskId ?? undefined,
    }),
    channel,
    { inboxId, status },
  );
}

export function getCommunicationItemHref(
  item: InboxListItem,
  items: readonly InboxListItem[] = [],
  listContext?: CommunicationListContextOptions,
): string {
  const channel = listContext?.channel ?? DEFAULT_COMMUNICATION_LIST_FILTER;
  const inboxId = listContext?.inboxId;
  const status = listContext?.status;
  if (item.kind === "email") {
    return withCommunicationListContext(
      withEmailListContext(
        `/email/${encodeURIComponent(item.inboxId)}/${encodeURIComponent(item.messageId)}`,
        "communication",
      ),
      { channel, inboxId, status },
    );
  }
  if (item.kind !== "task") {
    return getCommunicationChannelHref(channel, { inboxId, status });
  }

  const slug = getInboxItemRouteSlug(item);
  const hasSlugCollision =
    items.length > 0 &&
    items.some(
      (other) => other.id !== item.id && getInboxItemRouteSlug(other) === slug,
    );
  if (hasSlugCollision) {
    return getCommunicationHref(item.id, channel, { inboxId, status });
  }
  return getCommunicationTaskRouteHref(
    {
      number: item.number,
      projectKey: item.projectKey,
      contactKey: item.contactKey,
      taskId: item.id,
    },
    { channel, inboxId, status },
  );
}

export function buildCommunicationItemHrefById(
  items: readonly InboxListItem[],
  listContext?: CommunicationListContextOptions,
): Map<string, string> {
  const hrefById = new Map<string, string>();
  for (const item of items) {
    hrefById.set(item.id, getCommunicationItemHref(item, items, listContext));
  }
  return hrefById;
}

export function getFirstCommunicationItemHref(
  items: readonly InboxListItem[],
  listContext?: CommunicationListContextOptions,
): string | null {
  const first = items[0];
  if (!first) return null;
  return getCommunicationItemHref(first, items, listContext);
}

export function findCommunicationItemBySlugOrId(
  items: readonly InboxListItem[],
  slugOrId: string,
): InboxListItem | null {
  return findInboxItemBySlugOrId(items, slugOrId) ?? null;
}
