"use client";

import { TaskDueDateDropdown } from "./task-due-date-dropdown";

type TaskDueDateFieldProps = {
  taskId: string;
  projectId: string | null;
  dueDate: Date | null;
  status?: string | null;
  disabled?: boolean;
};

export function TaskDueDateField({
  taskId,
  projectId,
  dueDate,
  status,
  disabled = false,
}: TaskDueDateFieldProps) {
  return (
    <TaskDueDateDropdown
      taskId={taskId}
      projectId={projectId}
      dueDate={dueDate}
      status={status}
      variant="property"
      disabled={disabled}
    />
  );
}
