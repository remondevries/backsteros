import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

const BACKSTEROS_TASK_CHAT_STORAGE_KEY = "t3code:backsteros-task-chats";
const BACKSTEROS_TASK_CHAT_STORAGE_VERSION = 4;

export type BacksterosTaskChatBinding =
  | {
      readonly kind: "draft";
      readonly draftId: string;
      readonly threadId: string;
      readonly environmentId: string;
      readonly t3ProjectId: string;
      readonly backsterosProjectId: string;
      /** BacksterOS project display name for breadcrumbs. */
      readonly projectTitle: string;
      /** BacksterOS task title for breadcrumbs / draft label. */
      readonly title: string;
      /** e.g. `BSH-11` — shown between nav/task toggles when the detail rail is closed. */
      readonly displayId: string | null;
    }
  | {
      readonly kind: "thread";
      readonly threadId: string;
      readonly environmentId: string;
      readonly t3ProjectId: string;
      readonly backsterosProjectId: string;
      readonly projectTitle: string;
      readonly title: string;
      readonly displayId: string | null;
    };

interface BacksterosTaskChatStoreState {
  readonly byTaskId: Record<string, BacksterosTaskChatBinding>;
  /**
   * Scoped thread keys (`environmentId:threadId`) from prior task-chat
   * sessions (e.g. after /clear). Kept so vibe mode does not resurface them.
   */
  readonly retiredThreadKeys: readonly string[];
  readonly setBinding: (taskId: string, binding: BacksterosTaskChatBinding) => void;
  readonly clearBinding: (taskId: string) => void;
  readonly getBinding: (taskId: string) => BacksterosTaskChatBinding | null;
}

function bindingThreadKey(binding: BacksterosTaskChatBinding): string {
  return `${binding.environmentId}:${binding.threadId}`;
}

function withRetiredThreadKey(
  retiredThreadKeys: readonly string[],
  threadKey: string,
): readonly string[] {
  return retiredThreadKeys.includes(threadKey)
    ? retiredThreadKeys
    : [...retiredThreadKeys, threadKey];
}

function normalizeBinding(raw: unknown): BacksterosTaskChatBinding | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    (value.kind !== "draft" && value.kind !== "thread") ||
    typeof value.threadId !== "string" ||
    typeof value.environmentId !== "string" ||
    typeof value.t3ProjectId !== "string" ||
    typeof value.backsterosProjectId !== "string" ||
    typeof value.title !== "string"
  ) {
    return null;
  }
  const projectTitle = typeof value.projectTitle === "string" ? value.projectTitle : "";
  const displayId = typeof value.displayId === "string" ? value.displayId : null;
  if (value.kind === "draft") {
    if (typeof value.draftId !== "string") return null;
    return {
      kind: "draft",
      draftId: value.draftId,
      threadId: value.threadId,
      environmentId: value.environmentId,
      t3ProjectId: value.t3ProjectId,
      backsterosProjectId: value.backsterosProjectId,
      projectTitle,
      title: value.title,
      displayId,
    };
  }
  return {
    kind: "thread",
    threadId: value.threadId,
    environmentId: value.environmentId,
    t3ProjectId: value.t3ProjectId,
    backsterosProjectId: value.backsterosProjectId,
    projectTitle,
    title: value.title,
    displayId,
  };
}

function normalizeRetiredThreadKeys(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const keys: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && entry.includes(":") && !keys.includes(entry)) {
      keys.push(entry);
    }
  }
  return keys;
}

export const useBacksterosTaskChatStore = create<BacksterosTaskChatStoreState>()(
  persist(
    (set, get) => ({
      byTaskId: {},
      retiredThreadKeys: [],
      setBinding: (taskId, binding) =>
        set((state) => {
          const previous = state.byTaskId[taskId];
          let retiredThreadKeys = state.retiredThreadKeys;
          if (previous) {
            const previousKey = bindingThreadKey(previous);
            if (previousKey !== bindingThreadKey(binding)) {
              retiredThreadKeys = withRetiredThreadKey(retiredThreadKeys, previousKey);
            }
          }
          return {
            byTaskId: {
              ...state.byTaskId,
              [taskId]: binding,
            },
            retiredThreadKeys,
          };
        }),
      clearBinding: (taskId) =>
        set((state) => {
          const previous = state.byTaskId[taskId];
          if (!previous) return state;
          const { [taskId]: _removed, ...byTaskId } = state.byTaskId;
          return {
            byTaskId,
            retiredThreadKeys: withRetiredThreadKey(
              state.retiredThreadKeys,
              bindingThreadKey(previous),
            ),
          };
        }),
      getBinding: (taskId) => get().byTaskId[taskId] ?? null,
    }),
    {
      name: BACKSTEROS_TASK_CHAT_STORAGE_KEY,
      version: BACKSTEROS_TASK_CHAT_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        byTaskId: state.byTaskId,
        retiredThreadKeys: state.retiredThreadKeys,
      }),
      migrate: (persisted) => {
        const state = persisted as {
          byTaskId?: Record<string, unknown>;
          retiredThreadKeys?: unknown;
        } | null;
        const byTaskId: Record<string, BacksterosTaskChatBinding> = {};
        for (const [taskId, raw] of Object.entries(state?.byTaskId ?? {})) {
          const binding = normalizeBinding(raw);
          if (binding) byTaskId[taskId] = binding;
        }
        return {
          byTaskId,
          retiredThreadKeys: normalizeRetiredThreadKeys(state?.retiredThreadKeys),
        };
      },
    },
  ),
);

export const BACKSTEROS_TASK_LOGICAL_PROJECT_KEY_PREFIX = "backsteros:task:" as const;

export function backsterosTaskLogicalProjectKey(taskId: string): string {
  return `${BACKSTEROS_TASK_LOGICAL_PROJECT_KEY_PREFIX}${taskId}`;
}

export function isBacksterosTaskLogicalProjectKey(key: string): boolean {
  return key.startsWith(BACKSTEROS_TASK_LOGICAL_PROJECT_KEY_PREFIX);
}

/**
 * Draft ids and scoped thread keys (`environmentId:threadId`) that belong to
 * log-mode BacksterOS task chats. Vibe mode should hide these so task work
 * does not pollute the normal T3 thread list.
 */
export function collectBacksterosVibeHiddenChatKeys(input: {
  readonly byTaskId?: Readonly<Record<string, BacksterosTaskChatBinding>> | null;
  readonly retiredThreadKeys?: readonly string[] | null;
}): {
  readonly draftIds: ReadonlySet<string>;
  readonly threadKeys: ReadonlySet<string>;
} {
  const draftIds = new Set<string>();
  const threadKeys = new Set<string>(input.retiredThreadKeys ?? []);
  for (const binding of Object.values(input.byTaskId ?? {})) {
    threadKeys.add(bindingThreadKey(binding));
    if (binding.kind === "draft") {
      draftIds.add(binding.draftId);
    }
  }
  return { draftIds, threadKeys };
}
