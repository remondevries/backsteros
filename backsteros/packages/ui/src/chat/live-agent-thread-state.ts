/**
 * Single owner for the open shell agent DM thread (messages + thinking).
 *
 * Every source — open, refetch, poll, SSE push, send, delete — goes through
 * {@link liveAgentThreadReducer}. Snapshots are merged by message id instead of
 * replacing the list, so a fetch that started before a reply landed can never
 * drop that reply, and a stale `pendingReplyAt` can never revive "thinking"
 * after an idle / reply signal.
 */
import type {
  ChatThreadMessage,
  ChatThreadMessageChoices,
  ChatThreadMessageChoicesAnswer,
  ChatThreadWithMessages,
  ChatUiMessage,
} from "@backsteros/contracts";

import {
  chatThreadMessageToUi,
  chatThreadMessagesToUi,
  thinkingStatusMessage,
  webhookErrorStatusMessage,
  withChoicesDismissedStates,
} from "./agent-chat-message-adapter.js";
import {
  CHAT_THINKING_OFF,
  chatThinkingAfterSend,
  chatThinkingAfterStatus,
  chatThinkingFromPendingReplyAt,
  chatThinkingIsActive,
  type ChatThinkingState,
} from "./chat-thinking-state.js";

export type LiveAgentThreadState = {
  agentId: string | null;
  agentName: string;
  threadId: string | null;
  /** True once the first open resolved (or failed) for `agentId`. */
  loaded: boolean;
  /** Real + optimistic messages, sorted by createdAt. No thinking line. */
  messages: readonly ChatUiMessage[];
  /** Ids deleted locally — never resurrected by an older snapshot. */
  tombstones: ReadonlySet<string>;
  /** Inline error lines (webhook / send / open failures). */
  notices: readonly ChatUiMessage[];
  thinking: ChatThinkingState;
  /**
   * Server-clock ms of the newest thinking-relevant signal applied (status
   * push, reply, send). Older snapshots / status events cannot override it.
   */
  signalAt: number;
};

export type LiveAgentMessagePush = {
  id: string;
  body: string;
  createdAt: string;
  choices?: ChatThreadMessageChoices;
  choicesAnswer?: ChatThreadMessageChoicesAnswer | null;
};

export type LiveAgentThreadAction =
  | { type: "reset"; agentId: string | null; agentName: string }
  | {
      type: "opened";
      agentId: string;
      thread: ChatThreadWithMessages;
      nowMs: number;
    }
  | { type: "openFailed"; agentId: string; error: string }
  | { type: "snapshot"; thread: ChatThreadWithMessages; nowMs: number }
  | {
      type: "pushMessage";
      threadId: string;
      message: LiveAgentMessagePush;
    }
  | {
      type: "pushStatus";
      threadId: string;
      state: "working" | "idle";
      label: string | null;
      at: string | null;
      nowMs: number;
    }
  | { type: "sendStarted"; message: ChatUiMessage }
  | {
      type: "sendSucceeded";
      pendingId: string;
      message: ChatThreadMessage;
      thinking: boolean;
      webhookError: string | null;
      nowMs: number;
    }
  | { type: "sendFailed"; pendingId: string; error: string }
  | { type: "deleteStarted"; ids: readonly string[] }
  | { type: "deleteFailed"; restore: readonly ChatUiMessage[] }
  | { type: "thinkingExpired"; nowMs: number };

export function createLiveAgentThreadState(
  agentId: string | null,
  agentName: string,
): LiveAgentThreadState {
  return {
    agentId,
    agentName,
    threadId: null,
    loaded: false,
    messages: [],
    tombstones: new Set(),
    notices: [],
    thinking: CHAT_THINKING_OFF,
    signalAt: 0,
  };
}

function isoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function byCreatedAt(a: ChatUiMessage, b: ChatUiMessage): number {
  return isoMs(a.createdAt) - isoMs(b.createdAt);
}

function sameMessage(a: ChatUiMessage, b: ChatUiMessage): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.role === b.role &&
    a.createdAt === b.createdAt &&
    JSON.stringify(a.parts) === JSON.stringify(b.parts)
  );
}

/** Return `previous` when nothing changed so React can skip the re-render. */
function stableList(
  previous: readonly ChatUiMessage[],
  next: ChatUiMessage[],
): readonly ChatUiMessage[] {
  if (previous.length !== next.length) return next;
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return next;
  }
  return previous;
}

/**
 * Merge a server snapshot into the client list.
 * - Snapshot is authoritative for ids it contains (full bodies replace SSE previews).
 * - Client-only messages survive when optimistic (pending) or newer than the
 *   snapshot's newest message — i.e. the snapshot predates them.
 * - Client-only messages older than the snapshot were deleted server-side.
 */
export function mergeLiveThreadMessages(
  current: readonly ChatUiMessage[],
  snapshot: readonly ChatThreadMessage[],
  tombstones: ReadonlySet<string>,
): readonly ChatUiMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const snapshotIds = new Set<string>();
  let snapshotNewest = 0;
  const merged: ChatUiMessage[] = [];
  const uiSnapshot = chatThreadMessagesToUi(snapshot);
  for (let index = 0; index < uiSnapshot.length; index += 1) {
    const raw = snapshot[index]!;
    const next = uiSnapshot[index]!;
    snapshotIds.add(raw.id);
    snapshotNewest = Math.max(snapshotNewest, isoMs(raw.createdAt));
    if (tombstones.has(next.id)) continue;
    const existing = currentById.get(next.id);
    merged.push(existing && sameMessage(existing, next) ? existing : next);
  }
  for (const message of current) {
    if (snapshotIds.has(message.id) || tombstones.has(message.id)) continue;
    if (
      message.status === "pending" ||
      isoMs(message.createdAt) > snapshotNewest
    ) {
      merged.push(message);
    }
  }
  merged.sort(byCreatedAt);
  return stableList(current, withChoicesDismissedStates(merged));
}

function thinkingFromSnapshot(
  state: LiveAgentThreadState,
  thread: ChatThreadWithMessages,
  nowMs: number,
): Pick<LiveAgentThreadState, "thinking" | "signalAt"> {
  const updatedAt = isoMs(thread.updatedAt);
  // Snapshot older than the last push / send — keep what we have.
  if (updatedAt < state.signalAt) {
    return { thinking: state.thinking, signalAt: state.signalAt };
  }
  const carriedLabel =
    state.thinking.mode === "working" ? state.thinking.label : null;
  const fromServer = chatThinkingFromPendingReplyAt(
    thread.pendingReplyAt,
    nowMs,
    carriedLabel,
  );
  if (fromServer.mode === "working") {
    return { thinking: fromServer, signalAt: updatedAt };
  }
  // Provisional "thinking" after Remon sends is client-only: the server has no
  // pendingReplyAt for it, so only a newer assistant reply clears it here.
  if (state.thinking.mode === "provisional") {
    const replied = thread.messages.some(
      (message) =>
        message.role === "assistant" &&
        isoMs(message.createdAt) > state.signalAt,
    );
    if (!replied) return { thinking: state.thinking, signalAt: state.signalAt };
  }
  return { thinking: CHAT_THINKING_OFF, signalAt: updatedAt };
}

function insertMessage(
  messages: readonly ChatUiMessage[],
  message: ChatUiMessage,
): readonly ChatUiMessage[] {
  if (messages.some((entry) => entry.id === message.id)) return messages;
  return [...messages, message].sort(byCreatedAt);
}

export function liveAgentThreadReducer(
  state: LiveAgentThreadState,
  action: LiveAgentThreadAction,
): LiveAgentThreadState {
  switch (action.type) {
    case "reset":
      if (
        state.agentId === action.agentId &&
        state.agentName === action.agentName
      ) {
        return state;
      }
      if (state.agentId === action.agentId) {
        return { ...state, agentName: action.agentName };
      }
      return createLiveAgentThreadState(action.agentId, action.agentName);

    case "opened": {
      if (state.agentId !== action.agentId) return state;
      const base: LiveAgentThreadState =
        state.threadId === action.thread.id
          ? state
          : { ...state, threadId: action.thread.id, messages: [], signalAt: 0 };
      return {
        ...base,
        loaded: true,
        agentName: action.thread.agentName?.trim() || base.agentName,
        messages: mergeLiveThreadMessages(
          base.messages,
          action.thread.messages,
          base.tombstones,
        ),
        ...thinkingFromSnapshot(base, action.thread, action.nowMs),
      };
    }

    case "openFailed":
      if (state.agentId !== action.agentId) return state;
      return {
        ...state,
        loaded: true,
        notices: [webhookErrorStatusMessage(action.error)],
        thinking: CHAT_THINKING_OFF,
      };

    case "snapshot": {
      if (!state.threadId || state.threadId !== action.thread.id) return state;
      const messages = mergeLiveThreadMessages(
        state.messages,
        action.thread.messages,
        state.tombstones,
      );
      const thinking = thinkingFromSnapshot(state, action.thread, action.nowMs);
      if (
        messages === state.messages &&
        thinking.thinking === state.thinking &&
        thinking.signalAt === state.signalAt
      ) {
        return state;
      }
      return { ...state, messages, ...thinking };
    }

    case "pushMessage": {
      if (state.threadId !== action.threadId) return state;
      if (state.tombstones.has(action.message.id)) return state;
      const pushed = chatThreadMessageToUi({
        id: action.message.id,
        threadId: action.threadId,
        role: "assistant",
        authorContactId: null,
        authorName: state.agentName,
        body: action.message.body,
        status: "done",
        createdAt: action.message.createdAt,
        updatedAt: action.message.createdAt,
        ...(action.message.choices
          ? {
              choices: action.message.choices,
              choicesAnswer: action.message.choicesAnswer ?? null,
            }
          : {}),
      });
      // Same id may arrive again with choicesAnswer filled in.
      const without = state.messages.filter(
        (message) => message.id !== pushed.id,
      );
      return {
        ...state,
        messages: withChoicesDismissedStates(
          insertMessage(without, pushed),
        ),
        thinking: CHAT_THINKING_OFF,
        signalAt: Math.max(state.signalAt, isoMs(action.message.createdAt)),
      };
    }

    case "pushStatus": {
      if (state.threadId !== action.threadId) return state;
      const at = isoMs(action.at);
      if (at > 0 && at < state.signalAt) return state;
      return {
        ...state,
        thinking: chatThinkingAfterStatus(
          action.state,
          action.nowMs,
          action.label,
        ),
        signalAt: Math.max(state.signalAt, at),
      };
    }

    case "sendStarted":
      return {
        ...state,
        notices: [],
        messages: withChoicesDismissedStates(
          insertMessage(state.messages, action.message),
        ),
      };

    case "sendSucceeded": {
      const real = chatThreadMessageToUi(action.message);
      const withoutPending = state.messages.filter(
        (message) => message.id !== action.pendingId,
      );
      const messages = withChoicesDismissedStates(
        insertMessage(withoutPending, real),
      );
      const sentAt = isoMs(action.message.createdAt);
      const notices = action.webhookError
        ? [webhookErrorStatusMessage(action.webhookError)]
        : [];
      // Agent already reported status after this send (fast agent) — keep it.
      if (state.signalAt > sentAt) {
        return { ...state, messages, notices };
      }
      return {
        ...state,
        messages,
        notices,
        thinking:
          action.webhookError || !action.thinking
            ? CHAT_THINKING_OFF
            : chatThinkingAfterSend(action.nowMs),
        signalAt: Math.max(state.signalAt, sentAt),
      };
    }

    case "sendFailed":
      return {
        ...state,
        messages: state.messages.filter(
          (message) => message.id !== action.pendingId,
        ),
        notices: [webhookErrorStatusMessage(action.error)],
      };

    case "deleteStarted": {
      const ids = new Set(action.ids);
      const tombstones = new Set(state.tombstones);
      for (const id of ids) tombstones.add(id);
      return {
        ...state,
        tombstones,
        messages: state.messages.filter((message) => !ids.has(message.id)),
      };
    }

    case "deleteFailed": {
      const tombstones = new Set(state.tombstones);
      for (const message of action.restore) tombstones.delete(message.id);
      let messages = state.messages;
      for (const message of action.restore) {
        messages = insertMessage(messages, message);
      }
      return { ...state, tombstones, messages };
    }

    case "thinkingExpired":
      if (
        state.thinking.mode === "off" ||
        chatThinkingIsActive(state.thinking, action.nowMs)
      ) {
        return state;
      }
      return { ...state, thinking: CHAT_THINKING_OFF };

    default:
      return state;
  }
}

/** Rendered list: messages, then inline notices, then the thinking line. */
export function liveAgentThreadView(
  state: LiveAgentThreadState,
): ChatUiMessage[] {
  const view = [...state.messages, ...state.notices];
  if (state.thinking.mode !== "off") {
    view.push(
      thinkingStatusMessage(state.agentName, { label: state.thinking.label }),
    );
  }
  return view;
}

/**
 * Coalesce concurrent refetches: at most one request in flight, plus one
 * trailing run if more were requested meanwhile (reply + idle + poll used to
 * fire three overlapping GETs).
 */
export function createCoalescedRunner(
  run: () => Promise<void>,
): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let again = false;
  const start = (): Promise<void> => {
    inFlight = (async () => {
      try {
        await run();
      } finally {
        if (again) {
          again = false;
          await start();
        } else {
          inFlight = null;
        }
      }
    })();
    return inFlight;
  };
  return () => {
    if (inFlight) {
      again = true;
      return inFlight;
    }
    return start();
  };
}
