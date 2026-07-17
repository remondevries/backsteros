"use client";

import { updateProjectNameAction } from "@/lib/mutations/projects";
import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
import { updateLocalProjectName } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

type ProjectOverviewNameEditorProps = {
  projectId: string;
  value: string;
  renameFocusRequest?: number;
  onLeaveTitle?: (reason: "enter" | "escape" | "tab") => void;
  onNameSaved?: (name: string) => void;
};

export function ProjectOverviewNameEditor({
  projectId,
  value,
  renameFocusRequest = 0,
  onLeaveTitle,
  onNameSaved,
}: ProjectOverviewNameEditorProps) {
  return (
    <OverviewNameEditor
      value={value}
      entityLabel="Project"
      resetKey={projectId}
      renameFocusRequest={renameFocusRequest}
      onLeaveTitle={onLeaveTitle}
      onSave={(name) =>
        runEntityPersist(
          () => updateLocalProjectName({ projectId, name }),
          () => updateProjectNameAction({ projectId, name }),
        )
      }
      onSaved={(name) => {
        onNameSaved?.(name);
      }}
    />
  );
}
