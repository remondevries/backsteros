import type { ChatConversation } from "@backsteros/contracts";

import { formatLocalYmd, getTaskDueDateYmd } from "../tasks/task-due-date.js";
import {
  taskDueDateMatchesFilter,
  type TasksDueFilter,
} from "../tasks/tasks-due-filters.js";
import { resolveChatChannelKind } from "./chat-channel-kind.js";
import {
  emailStatusToChatListStatus,
  type CommunicationChatListRow,
  type CommunicationChatListStatusGroup,
} from "./communication-chat-list-row.js";
import {
  CHAT_LIST_STATUS_ORDER,
  type ChatListStatus,
} from "./chat-conversation-list-item.js";

export const COMMUNICATION_CHAT_LIST_FILTER_ALL = "__all__";

export type CommunicationChatListKindFilter =
  | "email"
  | "chat"
  | "support"
  | "whatsapp"
  | "x";

/** Due presets plus “no due date”. */
export type CommunicationChatListDueFilter = TasksDueFilter | "none";

export type CommunicationChatListPartyFilter =
  | { kind: "contact"; id: string }
  | { kind: "organization"; id: string }
  | null;

export type CommunicationChatListFilters = {
  kind: CommunicationChatListKindFilter | null;
  /** Inclusive activity start (YYYY-MM-DD). */
  activityFromYmd: string | null;
  /** Inclusive activity end (YYYY-MM-DD). */
  activityToYmd: string | null;
  party: CommunicationChatListPartyFilter;
  status: ChatListStatus | null;
  due: CommunicationChatListDueFilter | null;
  /** Project key, or `null` for any. Empty string means “no project”. */
  projectKey: string | null;
  /** 0–4, or `null` for any. */
  priority: number | null;
};

export const EMPTY_COMMUNICATION_CHAT_LIST_FILTERS: CommunicationChatListFilters =
  {
    kind: null,
    activityFromYmd: null,
    activityToYmd: null,
    party: null,
    status: null,
    due: null,
    projectKey: null,
    priority: null,
  };

export type CommunicationChatListFilterContext = {
  /** Resolve a chat visitor to a BacksterOS contact id when linked. */
  resolveConversationContactId?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  /** Resolve a chat visitor to a BacksterOS organization id when linked. */
  resolveConversationOrganizationId?: (
    conversation: ChatConversation,
  ) => string | null | undefined;
  referenceDate?: Date;
};

export function countCommunicationChatListFilters(
  filters: CommunicationChatListFilters,
): number {
  let count = 0;
  if (filters.kind) count += 1;
  if (filters.activityFromYmd || filters.activityToYmd) count += 1;
  if (filters.party) count += 1;
  if (filters.status) count += 1;
  if (filters.due) count += 1;
  if (filters.projectKey != null) count += 1;
  if (filters.priority != null) count += 1;
  return count;
}

export function communicationChatListFiltersAreActive(
  filters: CommunicationChatListFilters,
): boolean {
  return countCommunicationChatListFilters(filters) > 0;
}

function rowActivityMs(row: CommunicationChatListRow): number | null {
  if (row.kind === "chat") {
    const raw =
      row.conversation.lastActivityAt ?? row.conversation.updatedAt;
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = row.item.updatedAt;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

function rowActivityYmd(row: CommunicationChatListRow): string | null {
  const ms = rowActivityMs(row);
  if (ms == null) return null;
  return formatLocalYmd(new Date(ms));
}

function rowDueValue(
  row: CommunicationChatListRow,
): string | number | null {
  if (row.kind === "chat") return row.conversation.dueDate;
  return row.item.dueDate;
}

function rowStatus(row: CommunicationChatListRow): ChatListStatus {
  if (row.kind === "chat") {
    return (
      CHAT_LIST_STATUS_ORDER.includes(row.conversation.status as ChatListStatus)
        ? row.conversation.status
        : "open"
    ) as ChatListStatus;
  }
  return emailStatusToChatListStatus(row.item.status);
}

function rowPriority(row: CommunicationChatListRow): number {
  return row.kind === "chat"
    ? (row.conversation.priority ?? 0)
    : (row.item.priority ?? 0);
}

function rowProjectKey(row: CommunicationChatListRow): string | null {
  if (row.kind === "chat") return null;
  return row.item.projectKey?.trim() || null;
}

function rowContactId(
  row: CommunicationChatListRow,
  context: CommunicationChatListFilterContext,
): string | null {
  if (row.kind === "email" || row.kind === "support") {
    return row.item.contactId?.trim() || null;
  }
  return context.resolveConversationContactId?.(row.conversation)?.trim() || null;
}

function rowOrganizationId(
  row: CommunicationChatListRow,
  context: CommunicationChatListFilterContext,
): string | null {
  if (row.kind === "email" || row.kind === "support") {
    return row.item.organizationId?.trim() || null;
  }
  return (
    context.resolveConversationOrganizationId?.(row.conversation)?.trim() ||
    null
  );
}

function matchesActivityRange(
  row: CommunicationChatListRow,
  filters: CommunicationChatListFilters,
): boolean {
  const from = filters.activityFromYmd?.trim() || null;
  const to = filters.activityToYmd?.trim() || null;
  if (!from && !to) return true;
  const ymd = rowActivityYmd(row);
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

function matchesDue(
  row: CommunicationChatListRow,
  due: CommunicationChatListDueFilter,
  referenceDate: Date,
): boolean {
  const value = rowDueValue(row);
  if (due === "none") {
    return !getTaskDueDateYmd(value);
  }
  const status =
    row.kind === "chat"
      ? row.conversation.status
      : row.item.status;
  if (due === "overdue") {
    const inactive =
      status === "resolved" ||
      status === "completed" ||
      status === "canceled" ||
      status === "duplicated";
    if (inactive) return false;
  }
  return taskDueDateMatchesFilter(value, due, referenceDate);
}

function rowMatchesKindFilter(
  row: CommunicationChatListRow,
  kind: CommunicationChatListKindFilter,
): boolean {
  if (kind === "email") return row.kind === "email";
  if (kind === "support") return row.kind === "support";
  if (row.kind !== "chat") return false;
  const channelKind = resolveChatChannelKind(row.conversation.channelType, {
    inboxName: row.conversation.inboxName,
    contactName: row.conversation.contactName,
  });
  if (kind === "whatsapp") return channelKind === "whatsapp";
  if (kind === "x") return channelKind === "x";
  // "chat" = Chatwoot chats that are not WhatsApp / X (those have own filters).
  return channelKind !== "whatsapp" && channelKind !== "x";
}

export function communicationChatListRowMatchesFilters(
  row: CommunicationChatListRow,
  filters: CommunicationChatListFilters,
  context: CommunicationChatListFilterContext = {},
): boolean {
  if (filters.kind && !rowMatchesKindFilter(row, filters.kind)) return false;
  if (!matchesActivityRange(row, filters)) return false;

  if (filters.party?.kind === "contact") {
    if (rowContactId(row, context) !== filters.party.id) return false;
  } else if (filters.party?.kind === "organization") {
    if (rowOrganizationId(row, context) !== filters.party.id) return false;
  }

  if (filters.status && rowStatus(row) !== filters.status) return false;

  if (filters.due) {
    if (
      !matchesDue(
        row,
        filters.due,
        context.referenceDate ?? new Date(),
      )
    ) {
      return false;
    }
  }

  if (filters.projectKey != null) {
    const key = rowProjectKey(row);
    if (filters.projectKey === "") {
      if (key != null) return false;
    } else if (key !== filters.projectKey) {
      return false;
    }
  }

  if (filters.priority != null && rowPriority(row) !== filters.priority) {
    return false;
  }

  return true;
}

/** Apply structured filters; omit empty status groups. */
export function filterCommunicationChatListGroupsByFilters(
  groups: readonly CommunicationChatListStatusGroup[],
  filters: CommunicationChatListFilters,
  context: CommunicationChatListFilterContext = {},
): CommunicationChatListStatusGroup[] {
  if (!communicationChatListFiltersAreActive(filters)) return [...groups];
  return groups.flatMap((group) => {
    const rows = group.rows.filter((row) =>
      communicationChatListRowMatchesFilters(row, filters, context),
    );
    if (rows.length === 0) return [];
    return [{ ...group, rows }];
  });
}

export function encodeCommunicationChatListPartyValue(
  party: CommunicationChatListPartyFilter,
): string {
  if (!party) return COMMUNICATION_CHAT_LIST_FILTER_ALL;
  return `${party.kind}:${party.id}`;
}

export function parseCommunicationChatListPartyValue(
  value: string | null | undefined,
): CommunicationChatListPartyFilter {
  const raw = value?.trim() || "";
  if (!raw || raw === COMMUNICATION_CHAT_LIST_FILTER_ALL) return null;
  const contactPrefix = "contact:";
  const orgPrefix = "organization:";
  if (raw.startsWith(contactPrefix)) {
    const id = raw.slice(contactPrefix.length).trim();
    return id ? { kind: "contact", id } : null;
  }
  if (raw.startsWith(orgPrefix)) {
    const id = raw.slice(orgPrefix.length).trim();
    return id ? { kind: "organization", id } : null;
  }
  return null;
}
