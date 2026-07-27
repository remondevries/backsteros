"use client";

import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
import { updateTaskTitleAction } from "@/lib/mutations/tasks";

type TaskTitleEditorProps = {
  taskId: string;
  projectId: string | null;
  value: string;
  autoEdit?: boolean;
  renameFocusRequest?: number;
  onLeaveTitle?: (reason: "enter" | "escape" | "tab") => void;
  onSaved?: (title: string) => void;
};

export function TaskTitleEditor({
  taskId,
  projectId,
  value,
  autoEdit = false,
  renameFocusRequest = 0,
  onLeaveTitle,
  onSaved,
}: TaskTitleEditorProps) {
  return (
    <OverviewNameEditor
      value={value}
      entityLabel="Task"
      resetKey={taskId}
      autoEdit={autoEdit}
      renameFocusRequest={renameFocusRequest}
      onLeaveTitle={onLeaveTitle}
      onSave={(title) =>
        updateTaskTitleAction({ taskId, projectId, title })
      }
      onSaved={onSaved}
    />
  );
}
