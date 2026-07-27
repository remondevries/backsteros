"use client";

import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
import { updateLetterTitleAction } from "@/lib/mutations/letters";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

type LetterTitleEditorProps = {
  letterId: string;
  value: string;
  renameFocusRequest?: number;
  onLeaveTitle?: (reason: "enter" | "escape" | "tab") => void;
  onSaved?: (title: string) => void;
};

async function updateLocalLetterTitle() {
  return { ok: false as const, error: "Offline mutations are unavailable." };
}

export function LetterTitleEditor({
  letterId,
  value,
  renameFocusRequest = 0,
  onLeaveTitle,
  onSaved,
}: LetterTitleEditorProps) {
  return (
    <OverviewNameEditor
      value={value}
      entityLabel="Letter"
      resetKey={letterId}
      autoEdit={value === "New letter"}
      renameFocusRequest={renameFocusRequest}
      onLeaveTitle={onLeaveTitle}
      onSave={(title) =>
        runEntityPersist(
          () => updateLocalLetterTitle(),
          () => updateLetterTitleAction({ letterId, title }),
        )
      }
      onSaved={(title) => {
        onSaved?.(title);
      }}
    />
  );
}
