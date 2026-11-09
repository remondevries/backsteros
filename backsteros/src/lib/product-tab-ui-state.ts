/**
 * Per product-tab UI state for warm keep-alive surfaces that share one React
 * tree (Inbox / Communication / Tasks). Drafts, list mode, highlight, and
 * scroll must not leak across tabs of the same surface.
 *
 * App-wide defaults (e.g. last-used Inbox mode for *new* tabs) stay in their
 * existing stores; each open tab then owns an overlay slice.
 */

import type { InboxListMode } from "@backsteros/ui";

export type InboxProductTabUiState = {
  listMode: InboxListMode | null;
  messagesHighlightedId: string | null;
  collapsedGroupIds: string[];
  lastOpenedHref: string | null;
  panelScrollTop: number;
  mainScrollTop: number;
};

export type CommunicationProductTabUiState = {
  composeTo: string;
  createOpen: boolean;
  createKind: string | null;
  listBulkSelecting: boolean;
  chatContactCollapsed: boolean;
  chatContactExpanded: boolean;
  mainScrollTop: number;
  listScrollTop: number;
};

export type TasksProductTabUiState = {
  mainScrollTop: number;
};

export type ProductTabUiState = {
  inbox: InboxProductTabUiState;
  communication: CommunicationProductTabUiState;
  tasks: TasksProductTabUiState;
  /** Shared `.page-scroll` main column — one position per product tab. */
  pageScrollTop: number;
};

const listeners = new Set<() => void>();
let epoch = 0;
const stateByTabId = new Map<string, ProductTabUiState>();

function emptyInbox(): InboxProductTabUiState {
  return {
    listMode: null,
    messagesHighlightedId: null,
    collapsedGroupIds: [],
    lastOpenedHref: null,
    panelScrollTop: 0,
    mainScrollTop: 0,
  };
}

function emptyCommunication(): CommunicationProductTabUiState {
  return {
    composeTo: "",
    createOpen: false,
    createKind: null,
    listBulkSelecting: false,
    chatContactCollapsed: false,
    chatContactExpanded: false,
    mainScrollTop: 0,
    listScrollTop: 0,
  };
}

function emptyTasks(): TasksProductTabUiState {
  return { mainScrollTop: 0 };
}

function emptyState(): ProductTabUiState {
  return {
    inbox: emptyInbox(),
    communication: emptyCommunication(),
    tasks: emptyTasks(),
    pageScrollTop: 0,
  };
}

function emit(): void {
  epoch += 1;
  for (const listener of listeners) listener();
}

export function getProductTabUiEpoch(): number {
  return epoch;
}

export function subscribeProductTabUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProductTabUiState(tabId: string): ProductTabUiState {
  const existing = stateByTabId.get(tabId);
  if (existing) return existing;
  const created = emptyState();
  stateByTabId.set(tabId, created);
  return created;
}

export function ensureProductTabUiState(tabId: string): ProductTabUiState {
  return getProductTabUiState(tabId);
}

export function patchProductTabInboxUi(
  tabId: string,
  patch: Partial<InboxProductTabUiState>,
): InboxProductTabUiState {
  const current = getProductTabUiState(tabId);
  const nextInbox = { ...current.inbox, ...patch };
  stateByTabId.set(tabId, { ...current, inbox: nextInbox });
  emit();
  return nextInbox;
}

export function patchProductTabCommunicationUi(
  tabId: string,
  patch: Partial<CommunicationProductTabUiState>,
): CommunicationProductTabUiState {
  const current = getProductTabUiState(tabId);
  const nextComm = { ...current.communication, ...patch };
  stateByTabId.set(tabId, { ...current, communication: nextComm });
  emit();
  return nextComm;
}

export function patchProductTabTasksUi(
  tabId: string,
  patch: Partial<TasksProductTabUiState>,
): TasksProductTabUiState {
  const current = getProductTabUiState(tabId);
  const nextTasks = { ...current.tasks, ...patch };
  stateByTabId.set(tabId, { ...current, tasks: nextTasks });
  emit();
  return nextTasks;
}

export function patchProductTabPageScroll(
  tabId: string,
  pageScrollTop: number,
): void {
  const current = getProductTabUiState(tabId);
  if (current.pageScrollTop === pageScrollTop) return;
  stateByTabId.set(tabId, { ...current, pageScrollTop });
  emit();
}

/** Drop closed tabs so reopen gets a clean slice (new tab id). */
export function pruneProductTabUiState(openTabIds: readonly string[]): void {
  const keep = new Set(openTabIds);
  let changed = false;
  for (const id of [...stateByTabId.keys()]) {
    if (!keep.has(id)) {
      stateByTabId.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

export function resetProductTabUiStateForTests(): void {
  stateByTabId.clear();
  epoch = 0;
  listeners.clear();
}
