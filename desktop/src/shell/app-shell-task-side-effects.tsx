import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";
import {
  isInboxPath,
  refreshOpenTabTaskStatuses,
  resolveProductTabTaskMeta,
  syncActiveTabTaskMeta,
  type ProductTabsState,
} from "@backsteros/ui";

import { useAgentAttentionNotifications } from "../lib/agent/use-agent-attention-notifications";
import { useDesktopWorkspaceTasks } from "../lib/workspace-data";

/**
 * Task-slice-only side effects for the shell so document/people updates do not
 * re-subscribe this subtree — and task sync pulses stay isolated here.
 */
export function AppShellTaskSideEffects({
  setTabsState,
}: {
  setTabsState: Dispatch<SetStateAction<ProductTabsState>>;
}) {
  const location = useLocation();
  const { allTasks } = useDesktopWorkspaceTasks();
  useAgentAttentionNotifications(allTasks);

  useEffect(() => {
    if (isInboxPath(location.pathname)) {
      setTabsState((current) =>
        syncActiveTabTaskMeta(current, {
          taskId: null,
          taskStatus: null,
        }),
      );
      return;
    }
    const meta = resolveProductTabTaskMeta(
      { id: "active", href: location.pathname, title: "" },
      allTasks,
    );
    setTabsState((current) =>
      syncActiveTabTaskMeta(current, {
        taskId: meta.taskId,
        taskStatus: meta.taskStatus,
      }),
    );
  }, [allTasks, location.pathname, setTabsState]);

  useEffect(() => {
    const statusByTaskId = new Map(
      allTasks.map((task) => [task.id, task.status] as const),
    );
    setTabsState((current) =>
      refreshOpenTabTaskStatuses(current, statusByTaskId),
    );
  }, [allTasks, setTabsState]);

  return null;
}
