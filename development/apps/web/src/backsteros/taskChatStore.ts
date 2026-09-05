import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";

const BACKSTEROS_TASK_CHAT_STORAGE_KEY = "t3code:backsteros-task-chats";
const BACKSTEROS_TASK_CHAT_STORAGE_VERSION = 3;

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
  readonly setBinding: (taskId: string, binding: BacksterosTaskChatBinding) => void;
  readonly clearBinding: (taskId: string) => void;
  readonly getBinding: (taskId: string) => BacksterosTaskChatBinding | null;
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
  const projectTitle =
    typeof value.projectTitle === "string" ? value.projectTitle : "";
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

export const useBacksterosTaskChatStore = create<BacksterosTaskChatStoreState>()(
  persist(
    (set, get) => ({
      byTaskId: {},
      setBinding: (taskId, binding) =>
        set((state) => ({
          byTaskId: {
            ...state.byTaskId,
            [taskId]: binding,
          },
        })),
      clearBinding: (taskId) =>
        set((state) => {
          if (!(taskId in state.byTaskId)) return state;
          const { [taskId]: _removed, ...byTaskId } = state.byTaskId;
          return { byTaskId };
        }),
      getBinding: (taskId) => get().byTaskId[taskId] ?? null,
    }),
    {
      name: BACKSTEROS_TASK_CHAT_STORAGE_KEY,
      version: BACKSTEROS_TASK_CHAT_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byTaskId: state.byTaskId }),
      migrate: (persisted) => {
        const state = persisted as { byTaskId?: Record<string, unknown> } | null;
        const byTaskId: Record<string, BacksterosTaskChatBinding> = {};
        for (const [taskId, raw] of Object.entries(state?.byTaskId ?? {})) {
          const binding = normalizeBinding(raw);
          if (binding) byTaskId[taskId] = binding;
        }
        return { byTaskId };
      },
    },
  ),
);

export function backsterosTaskLogicalProjectKey(taskId: string): string {
  return `backsteros:task:${taskId}`;
}
