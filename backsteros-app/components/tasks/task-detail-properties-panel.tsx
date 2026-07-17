import type { Task } from "@/lib/db/schema";
import type { AssignableContact } from "@/lib/contacts/assignable-contact";

import { TaskAssigneeField } from "./task-assignee-field";
import { TaskDueDateField } from "./task-due-date-field";
import { TaskDetailPropertiesSection } from "./task-detail-properties-section";
import { TaskPriorityDropdown } from "./task-priority-dropdown";
import {
  TaskProjectField,
  type AssignableProject,
} from "./task-project-field";
import { TaskStatusDropdown } from "./task-status-dropdown";

type TaskDetailPropertiesPanelProps = {
  /** Null while the task is still loading — panel shows defaults, disabled. */
  task: Task | null;
  assignableProjects?: AssignableProject[];
  assignableContacts?: AssignableContact[];
  /** Sidebar only for now; inline layout stubbed unused. */
  layout?: "sidebar" | "inline";
};

function TaskDetailPropertiesFullPanel({
  task,
  assignableProjects = [],
  assignableContacts = [],
}: Omit<TaskDetailPropertiesPanelProps, "layout">) {
  const disabled = task == null;
  const taskId = task?.id ?? "";
  const projectId = task?.projectId ?? null;
  const status = task?.status ?? "triage";
  const priority = task?.priority ?? 0;
  const dueDate = task?.dueDate ?? null;
  const assigneeId = task?.assigneeId ?? null;

  return (
    <div className="flex flex-col gap-2">
      <TaskDetailPropertiesSection title="Properties">
        <TaskStatusDropdown
          taskId={taskId}
          projectId={projectId}
          status={status}
          variant="property"
          disabled={disabled}
        />
        <TaskPriorityDropdown
          taskId={taskId}
          projectId={projectId}
          priority={priority}
          variant="property"
          disabled={disabled}
        />
        <TaskDueDateField
          taskId={taskId}
          projectId={projectId}
          dueDate={dueDate}
          status={status}
          disabled={disabled}
        />
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[11px] font-medium text-foreground/45">
            Assignee
          </span>
          <TaskAssigneeField
            taskId={taskId}
            projectId={projectId}
            assigneeId={assigneeId}
            contacts={assignableContacts}
            disabled={disabled}
          />
        </div>
      </TaskDetailPropertiesSection>

      <TaskDetailPropertiesSection title="Project">
        <TaskProjectField
          taskId={taskId}
          projectId={projectId}
          status={status}
          projects={assignableProjects}
          disabled={disabled}
        />
      </TaskDetailPropertiesSection>
    </div>
  );
}

export function TaskDetailPropertiesPanel({
  task,
  assignableProjects = [],
  assignableContacts = [],
  layout = "sidebar",
}: TaskDetailPropertiesPanelProps) {
  if (layout === "inline") {
    return null;
  }

  return (
    <div className="task-detail-properties-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3 lg:pt-0">
      <TaskDetailPropertiesFullPanel
        task={task}
        assignableProjects={assignableProjects}
        assignableContacts={assignableContacts}
      />
    </div>
  );
}
