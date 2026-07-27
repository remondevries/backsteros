"use client";

import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
import { updateOrganizationNameAction } from "@/lib/mutations/organizations";
import { updateLocalOrganizationName } from "@/lib/sync/local-organization-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

type OrganizationOverviewNameEditorProps = {
  organizationId: string;
  value: string;
  onNameSaved?: (name: string) => void;
};

export function OrganizationOverviewNameEditor({
  organizationId,
  value,
  onNameSaved,
}: OrganizationOverviewNameEditorProps) {
  return (
    <OverviewNameEditor
      value={value}
      entityLabel="Organization"
      resetKey={organizationId}
      autoEdit={value === "New organization"}
      onSave={(name) =>
        runEntityPersist(
          () => updateLocalOrganizationName({ organizationId, name }),
          () => updateOrganizationNameAction({ organizationId, name }),
        )
      }
      onSaved={(name) => {
        onNameSaved?.(name);
      }}
    />
  );
}
