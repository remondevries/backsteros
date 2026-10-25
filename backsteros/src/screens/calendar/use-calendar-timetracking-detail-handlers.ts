import { useMemo, useRef } from "react";
import type { TaskStatus } from "@backsteros/ui";

import type { DesktopWorkspaceData } from "../../lib/workspace/workspace-data-types";

/** Stable task property handlers for the calendar Time tracking sessions detail. */
export function useCalendarTimetrackingDetailHandlers({
  patchTask,
  projects,
}: {
  patchTask: DesktopWorkspaceData["patchTask"];
  projects: DesktopWorkspaceData["projects"];
}) {
  const latestRef = useRef({ patchTask, projects });
  latestRef.current = { patchTask, projects };

  return useMemo(() => {
    const patch = (taskId: string, values: Record<string, unknown>) => {
      void latestRef.current.patchTask(taskId, values);
    };
    return {
      onTaskStatusChange: (taskId: string, status: TaskStatus) =>
        patch(taskId, { status }),
      onTaskPriorityChange: (taskId: string, priority: number) =>
        patch(taskId, { priority }),
      onTaskDueDateChange: (taskId: string, dueDate: Date | null) =>
        patch(taskId, { dueDate: dueDate ? dueDate.toISOString() : null }),
      onTaskAssigneeChange: (taskId: string, assigneeId: string | null) =>
        patch(taskId, { assigneeId }),
      onTaskProjectChange: (taskId: string, projectKey: string | null) => {
        const project = projectKey
          ? latestRef.current.projects.find(
              (entry) => entry.key === projectKey,
            ) ?? null
          : null;
        patch(taskId, { projectId: project?.id ?? null });
      },
    };
  }, []);
}
