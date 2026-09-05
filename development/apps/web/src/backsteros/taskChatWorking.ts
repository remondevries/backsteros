import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useMemo } from "react";

import { resolveSidebarThreadStatus } from "~/components/Sidebar.logic";
import { useThreadShells } from "~/state/entities";

import {
  useBacksterosTaskChatStore,
  type BacksterosTaskChatBinding,
} from "./taskChatStore";

const EMPTY_WORKING_TASK_IDS: ReadonlySet<string> = new Set();

function threadKey(environmentId: string, threadId: string): string {
  return `${environmentId}:${threadId}`;
}

/**
 * Task IDs whose bound T3 chat is in the same "Working" state as the vibe
 * sidebar (running/starting session or background fleet work).
 */
export function collectBacksterosWorkingTaskIds(input: {
  readonly byTaskId: Readonly<Record<string, BacksterosTaskChatBinding>>;
  readonly shells: ReadonlyArray<EnvironmentThreadShell>;
}): ReadonlySet<string> {
  const shellByKey = new Map(
    input.shells.map((shell) => [threadKey(shell.environmentId, shell.id), shell] as const),
  );

  const working = new Set<string>();
  for (const [taskId, binding] of Object.entries(input.byTaskId)) {
    const shell = shellByKey.get(threadKey(binding.environmentId, binding.threadId));
    if (!shell) continue;
    if (resolveSidebarThreadStatus(shell) === "working") {
      working.add(taskId);
    }
  }
  return working.size === 0 ? EMPTY_WORKING_TASK_IDS : working;
}

export function useBacksterosWorkingTaskIds(): ReadonlySet<string> {
  const byTaskId = useBacksterosTaskChatStore((state) => state.byTaskId);
  const shells = useThreadShells();
  return useMemo(
    () => collectBacksterosWorkingTaskIds({ byTaskId, shells }),
    [byTaskId, shells],
  );
}
