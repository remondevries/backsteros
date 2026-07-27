const STORAGE_KEY = "backsteros-desktop.task-agent-sessions";
/** Migrate bindings created before the desktop-specific key. */
const LEGACY_STORAGE_KEY = "backsteros-development.task-agent-sessions";
/** Chat ids the user destroyed — never resume/reattach these. */
const DESTROYED_CHATS_KEY = "backsteros-desktop.destroyed-agent-chat-ids";
const LEGACY_DESTROYED_CHATS_KEY =
  "backsteros-development.destroyed-agent-chat-ids";

export type TaskAgentSession = {
  id: string;
  taskId: string;
  /** Cursor Agent chat id (`agent --resume <chatId>`). */
  chatId: string;
  label: string;
  createdAt: string;
};

export type TaskAgentSessionStore = Record<string, TaskAgentSession[]>;

function isSession(value: unknown): value is TaskAgentSession {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.taskId === "string" &&
    typeof entry.chatId === "string" &&
    typeof entry.label === "string" &&
    typeof entry.createdAt === "string"
  );
}

function readDestroyedChatIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw =
      window.localStorage.getItem(DESTROYED_CHATS_KEY) ??
      window.localStorage.getItem(LEGACY_DESTROYED_CHATS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

function writeDestroyedChatIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DESTROYED_CHATS_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    /* ignore quota */
  }
}

/** True when this Cursor chat was ended/destroyed and must not be resumed. */
export function isAgentChatDestroyed(chatId: string): boolean {
  const normalized = chatId.trim().toLowerCase();
  if (!normalized) return false;
  return readDestroyedChatIds().has(normalized);
}

/** Mark a chat id as destroyed so attach/resume can never revive it. */
export function markAgentChatDestroyed(chatId: string): void {
  const normalized = chatId.trim().toLowerCase();
  if (!normalized) return;
  const ids = readDestroyedChatIds();
  if (ids.has(normalized)) return;
  ids.add(normalized);
  writeDestroyedChatIds(ids);
}

function parseSessionStore(raw: string | null): TaskAgentSessionStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const destroyed = readDestroyedChatIds();
    const out: TaskAgentSessionStore = {};
    for (const [taskId, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      const sessions = list.filter(
        (entry): entry is TaskAgentSession =>
          isSession(entry) &&
          !destroyed.has(entry.chatId.trim().toLowerCase()),
      );
      if (sessions.length > 0) out[taskId] = sessions;
    }
    return out;
  } catch {
    return {};
  }
}

export function readTaskAgentSessions(): TaskAgentSessionStore {
  if (typeof window === "undefined") return {};
  const primary = parseSessionStore(
    window.localStorage.getItem(STORAGE_KEY),
  );
  if (Object.keys(primary).length > 0) return primary;
  const legacy = parseSessionStore(
    window.localStorage.getItem(LEGACY_STORAGE_KEY),
  );
  if (Object.keys(legacy).length > 0) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    } catch {
      /* ignore */
    }
    return legacy;
  }
  return {};
}

export const TASK_AGENT_SESSIONS_CHANGED_EVENT =
  "backsteros-desktop:task-agent-sessions-changed";

export function writeTaskAgentSessions(store: TaskAgentSessionStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new Event(TASK_AGENT_SESSIONS_CHANGED_EVENT));
  } catch {
    /* ignore quota */
  }
}

export function listTaskAgentSessions(
  store: TaskAgentSessionStore,
  taskId: string,
): TaskAgentSession[] {
  return store[taskId] ?? [];
}

/** Bound Cursor chat id for a task, if any. */
export function getBoundChatIdForTask(taskId: string): string | null {
  const session = listTaskAgentSessions(readTaskAgentSessions(), taskId)[0];
  const chatId = session?.chatId.trim().toLowerCase() || null;
  return chatId && !isAgentChatDestroyed(chatId) ? chatId : null;
}

/** Task ids that currently have a resumable agent binding. */
export function listBoundAgentTaskIds(): string[] {
  return Object.keys(readTaskAgentSessions());
}

export function upsertTaskAgentSession(
  store: TaskAgentSessionStore,
  session: TaskAgentSession,
): TaskAgentSessionStore {
  if (isAgentChatDestroyed(session.chatId)) {
    return store;
  }
  const existing = store[session.taskId] ?? [];
  const withoutDup = existing.filter(
    (entry) => entry.id !== session.id && entry.chatId !== session.chatId,
  );
  return {
    ...store,
    [session.taskId]: [...withoutDup, session],
  };
}

export function removeTaskAgentSession(
  store: TaskAgentSessionStore,
  taskId: string,
  sessionId: string,
): TaskAgentSessionStore {
  const existing = store[taskId] ?? [];
  const next = existing.filter((entry) => entry.id !== sessionId);
  if (next.length === 0) {
    const { [taskId]: _, ...rest } = store;
    return rest;
  }
  return { ...store, [taskId]: next };
}

/** Drop every agent binding for a task (destroy / Start-working force-new). */
export function clearTaskAgentSessionsForTask(
  store: TaskAgentSessionStore,
  taskId: string,
): TaskAgentSessionStore {
  if (!(taskId in store)) return store;
  const { [taskId]: _, ...rest } = store;
  return rest;
}

export function createTaskAgentSession(input: {
  taskId: string;
  chatId: string;
  label?: string;
}): TaskAgentSession {
  return {
    id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    taskId: input.taskId,
    chatId: input.chatId.trim(),
    label: input.label ?? "Agent session started",
    createdAt: new Date().toISOString(),
  };
}
