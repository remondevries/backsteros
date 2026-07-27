"use client";

import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
import { updateContactNameAction } from "@/lib/mutations/contacts";
import { updateLocalContactName } from "@/lib/sync/local-contact-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

type ContactOverviewNameEditorProps = {
  contactId: string;
  value: string;
  onNameSaved?: (name: string) => void;
};

export function ContactOverviewNameEditor({
  contactId,
  value,
  onNameSaved,
}: ContactOverviewNameEditorProps) {
  return (
    <OverviewNameEditor
      value={value}
      entityLabel="Contact"
      resetKey={contactId}
      autoEdit={value === "New contact"}
      onSave={(name) =>
        runEntityPersist(
          () => updateLocalContactName({ contactId, name }),
          () => updateContactNameAction({ contactId, name }),
        )
      }
      onSaved={(name) => {
        onNameSaved?.(name);
      }}
    />
  );
}
