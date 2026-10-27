import { memo, useCallback, type ComponentProps } from "react";
import { ProjectTasksView, ProjectTimetrackingView } from "@backsteros/ui";

import {
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../../lib/agent/agent-list-indicators";
import type { DesktopAgentStatusContextValue } from "../../lib/agent/agent-status-context";
import { isEmailTaskListItem } from "../../lib/email-list-tasks";
import {
  propsEqualIgnoringCallbacks,
  useStableCallbackProps,
} from "../../lib/stable-callback-props";

type ProjectTasksViewProps = ComponentProps<typeof ProjectTasksView>;
type ProjectTaskRow = Parameters<
  NonNullable<ProjectTasksViewProps["isTaskAgentWorking"]>
>[0];

export type ProjectTasksSectionProps = Omit<
  ProjectTasksViewProps,
  "renderTaskTitleTrailing" | "isTaskAgentWorking"
> & {
  agentStatus: DesktopAgentStatusContextValue | null;
};

/**
 * Project Tasks section. Re-renders only when its data props change; inline
 * callbacks from the detail screen are forwarded through stable wrappers.
 */
export const ProjectTasksSection = memo(function ProjectTasksSection(
  props: ProjectTasksSectionProps,
) {
  const { agentStatus, ...viewProps } = useStableCallbackProps(props);
  const renderTaskTitleTrailing = useCallback(
    (task: ProjectTaskRow) =>
      isEmailTaskListItem(task)
        ? null
        : renderTaskAgentTitleTrailing({
            taskId: task.id,
            agentChatId: task.agentChatId,
            agentWorkingContactId: task.agentWorkingContactId,
            agentWorkingContactName: task.agentWorkingContactName,
            agentWorkingKind: task.agentWorkingKind,
            taskStatus: task.status,
            agentCreatedAt: task.agentCreatedAt,
            agentInboxApprovedAt: task.agentInboxApprovedAt,
            agentStatus,
            workingShownOnStatusIcon: true,
          }),
    [agentStatus],
  );
  const isTaskAgentWorking = useCallback(
    (task: ProjectTaskRow) =>
      isEmailTaskListItem(task)
        ? false
        : isTaskAgentWorkingForUi(task, agentStatus),
    [agentStatus],
  );
  return (
    <ProjectTasksView
      {...viewProps}
      renderTaskTitleTrailing={renderTaskTitleTrailing}
      isTaskAgentWorking={isTaskAgentWorking}
    />
  );
}, propsEqualIgnoringCallbacks);

export type ProjectTimetrackingSectionProps = ComponentProps<
  typeof ProjectTimetrackingView
>;

/** Project Time tracking section; same memo contract as {@link ProjectTasksSection}. */
export const ProjectTimetrackingSection = memo(
  function ProjectTimetrackingSection(props: ProjectTimetrackingSectionProps) {
    return <ProjectTimetrackingView {...useStableCallbackProps(props)} />;
  },
  propsEqualIgnoringCallbacks,
);
