import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { canSnooze, effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";

import {
  applyComposerColorMenuAction,
  isComposerColorMenuAction,
  resolveComposerAccentForMenu,
} from "../composerAccentMenu";
import { composerAccentOverrideKey, useComposerAccentStore } from "../composerAccentStore";
import { resolveSnoozePresets, snoozeWakeDescription } from "../components/Sidebar.snooze";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { useClientSettings } from "../hooks/useSettings";
import { useThreadActions } from "../hooks/useThreadActions";
import { readLocalApi } from "../localApi";
import {
  readEnvironmentSupportsPinning,
  readEnvironmentSupportsSnooze,
  readThreadShell,
} from "../state/entities";
import { useUiStateStore } from "../uiStateStore";
import {
  buildBacksterosTaskActionMenuItems,
  type BacksterosTaskActionMenuId,
} from "./backsterosTaskActionMenu";
import { deleteBacksterosTask } from "./client";
import { clearPendingBacksterosTaskStatus } from "./pendingTaskStatus";
import { useBacksterosTaskChatStore } from "./taskChatStore";
import { useBacksterosTaskDetailUiStore } from "./taskDetailUiStore";
import type { BacksterosCodebaseProject, BacksterosTask } from "./types";
import { removeBacksterosInboxTaskLocal } from "./useBacksterosInboxAttentionTasks";
import { removeBacksterosProjectTaskLocal } from "./useBacksterosProjectTasks";

function failureToast(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

/**
 * Native context menu for BacksterOS task rows: color, linked-thread lifecycle,
 * copy path/task id, and API soft-delete.
 */
export function useBacksterosTaskActionMenu() {
  const { pinThread, confirmAndUnpinThread, snoozeThread, unsnoozeThread } = useThreadActions();
  const markThreadUnread = useUiStateStore((state) => state.markThreadUnread);
  const clearTaskDetail = useBacksterosTaskDetailUiStore((state) => state.clearTaskDetail);
  const selectionTaskId = useBacksterosTaskDetailUiStore(
    (state) => state.selection?.taskId ?? null,
  );
  const timestampFormat = useClientSettings((state) => state.timestampFormat);
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{ path: string }>({
    onCopy: ({ path }) => {
      toastManager.add({ type: "success", title: "Path copied", description: path });
    },
    onError: (error) => failureToast("Failed to copy path", error),
  });
  const { copyToClipboard: copyTaskIdToClipboard } = useCopyToClipboard<{ taskId: string }>({
    onCopy: ({ taskId }) => {
      toastManager.add({ type: "success", title: "Task ID copied", description: taskId });
    },
    onError: (error) => failureToast("Failed to copy task ID", error),
  });

  const openMenu = useCallback(
    (
      task: BacksterosTask,
      project: BacksterosCodebaseProject | null | undefined,
      position: { x: number; y: number },
    ) => {
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const binding = useBacksterosTaskChatStore.getState().getBinding(task.id);
        const threadRef = binding ? scopeThreadRef(binding.environmentId, binding.threadId) : null;
        const thread = threadRef ? readThreadShell(threadRef) : null;
        const now = new Date();
        const nowIso = now.toISOString();
        const supportsPinning =
          threadRef != null && readEnvironmentSupportsPinning(threadRef.environmentId);
        const supportsSnooze =
          threadRef != null && readEnvironmentSupportsSnooze(threadRef.environmentId);
        const snoozePresets = resolveSnoozePresets(now, timestampFormat);
        const workspacePath = project?.localWorkingDirectory?.trim() || null;
        const items = buildBacksterosTaskActionMenuItems({
          hasLinkedThread: thread != null,
          isPinned: thread?.pinnedAt != null,
          isSnoozed: thread != null && effectiveSnoozed(thread, { now: nowIso }),
          canSnoozeNow: thread != null && canSnooze(thread, { now: nowIso }),
          supportsPinning,
          supportsSnooze,
          hasWorkspacePath: workspacePath != null,
          currentAccentColor: resolveComposerAccentForMenu({
            taskId: task.id,
            threadId: thread?.id ?? binding?.threadId ?? null,
            environmentId: thread?.environmentId ?? binding?.environmentId ?? null,
            instanceId: thread?.session?.providerInstanceId ?? thread?.modelSelection?.instanceId,
          }),
          snoozePresets,
        });
        const clicked = await settlePromise(() => api.contextMenu.show(items, position));
        if (clicked._tag === "Failure" || clicked.value === null) return;
        const action = clicked.value as BacksterosTaskActionMenuId;

        if (isComposerColorMenuAction(action)) {
          applyComposerColorMenuAction({
            action,
            taskId: task.id,
            threadId: thread?.id ?? binding?.threadId ?? null,
            environmentId: thread?.environmentId ?? binding?.environmentId ?? null,
          });
          return;
        }

        if (action.startsWith("snooze:")) {
          if (!threadRef) return;
          const preset = snoozePresets.find((candidate) => `snooze:${candidate.id}` === action);
          if (!preset) return;
          const result = await snoozeThread(threadRef, preset.snoozedUntil);
          if (result._tag === "Failure") {
            if (!isAtomCommandInterrupted(result)) {
              failureToast("Failed to snooze thread", squashAtomCommandFailure(result));
            }
            return;
          }
          toastManager.add(
            stackedThreadToast({
              type: "success",
              title: `Snoozed until ${snoozeWakeDescription(preset.snoozedUntil, new Date(), timestampFormat)}`,
              timeout: 5_000,
              actionProps: {
                children: "Undo",
                onClick: () => {
                  void unsnoozeThread(threadRef).then((undone) => {
                    if (undone._tag === "Failure" && !isAtomCommandInterrupted(undone)) {
                      failureToast("Failed to wake thread", squashAtomCommandFailure(undone));
                    }
                  });
                },
              },
            }),
          );
          return;
        }

        switch (action) {
          case "pin":
            if (!threadRef) return;
            {
              const result = await pinThread(threadRef);
              if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                failureToast("Failed to pin thread", squashAtomCommandFailure(result));
              }
            }
            return;
          case "unpin":
            if (!threadRef) return;
            {
              const result = await confirmAndUnpinThread(threadRef);
              if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                failureToast("Failed to unpin thread", squashAtomCommandFailure(result));
              }
            }
            return;
          case "unsnooze":
            if (!threadRef) return;
            {
              const result = await unsnoozeThread(threadRef);
              if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                failureToast("Failed to wake thread", squashAtomCommandFailure(result));
              }
            }
            return;
          case "mark-unread":
            if (!threadRef || !thread) return;
            markThreadUnread(scopedThreadKey(threadRef), thread.latestTurn?.completedAt);
            return;
          case "copy-path":
            if (!workspacePath) {
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Path unavailable",
                  description: "This task's project does not have a local working directory.",
                }),
              );
              return;
            }
            copyPathToClipboard(workspacePath, { path: workspacePath });
            return;
          case "copy-task-id":
            copyTaskIdToClipboard(task.id, { taskId: task.id });
            return;
          case "delete": {
            const confirmed = await settlePromise(() =>
              api.dialogs.confirm(
                [`Delete task "${task.title}"?`, "This soft-deletes the task in BacksterOS."].join(
                  "\n",
                ),
                { variant: "destructive" },
              ),
            );
            if (confirmed._tag === "Failure" || !confirmed.value) return;
            try {
              await deleteBacksterosTask(task.id);
              clearPendingBacksterosTaskStatus(task.id);
              useBacksterosTaskChatStore.getState().clearBinding(task.id);
              removeBacksterosProjectTaskLocal(task.id, task.projectId);
              removeBacksterosInboxTaskLocal(task.id);
              const accentKey = composerAccentOverrideKey({ taskId: task.id });
              if (accentKey) {
                useComposerAccentStore.getState().setOverride(accentKey, null);
              }
              if (selectionTaskId === task.id) {
                clearTaskDetail();
              }
              toastManager.add({
                type: "success",
                title: "Task deleted",
                description: task.title,
              });
            } catch (error) {
              failureToast("Failed to delete task", error);
            }
            return;
          }
          default:
            return;
        }
      })();
    },
    [
      clearTaskDetail,
      confirmAndUnpinThread,
      copyPathToClipboard,
      copyTaskIdToClipboard,
      markThreadUnread,
      pinThread,
      selectionTaskId,
      snoozeThread,
      timestampFormat,
      unsnoozeThread,
    ],
  );

  return { openMenu };
}
