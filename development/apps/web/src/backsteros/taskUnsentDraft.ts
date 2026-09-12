import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

import { composerDraftHasUserContent, DraftId, useComposerDraftStore } from "~/composerDraftStore";

import { useBacksterosTaskChatStore } from "./taskChatStore";

/**
 * True when this BacksterOS task's bound chat (draft or thread) has unsent
 * composer content — same signal as vibe-mode sidebar amber dots.
 */
export function useBacksterosTaskHasUnsentDraft(taskId: string): boolean {
  const binding = useBacksterosTaskChatStore((state) => state.byTaskId[taskId] ?? null);
  return useComposerDraftStore((state) => {
    if (!binding) return false;
    if (binding.kind === "draft") {
      return composerDraftHasUserContent(state.getComposerDraft(DraftId.make(binding.draftId)));
    }
    return composerDraftHasUserContent(
      state.getComposerDraft({
        environmentId: binding.environmentId as EnvironmentId,
        threadId: binding.threadId as ThreadId,
      }),
    );
  });
}

/** Shared amber draft-dot classes (Sidebar.tsx parity). */
export const BACKSTEROS_TASK_DRAFT_DOT_CLASSNAME =
  "size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400";
