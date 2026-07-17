"use client";

import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
import { apiErrorMessage, useAppApi } from "@/lib/api-context";

type DocumentTitleEditorProps = {
  documentId: string;
  value: string;
  renameFocusRequest?: number;
  onLeaveTitle?: (reason: "enter" | "escape" | "tab") => void;
  onTitleSaved?: (title: string) => void;
};

export function DocumentTitleEditor({
  documentId,
  value,
  renameFocusRequest = 0,
  onLeaveTitle,
  onTitleSaved,
}: DocumentTitleEditorProps) {
  const { client } = useAppApi();

  return (
    <OverviewNameEditor
      value={value}
      entityLabel="Document"
      resetKey={documentId}
      renameFocusRequest={renameFocusRequest}
      onLeaveTitle={onLeaveTitle}
      onSaved={onTitleSaved}
      onSave={async (title) => {
        try {
          await client.requestJson(
            `/api/v1/documents/${encodeURIComponent(documentId)}`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ title }),
            },
          );
          return { ok: true as const };
        } catch (error) {
          return { ok: false as const, error: apiErrorMessage(error) };
        }
      }}
    />
  );
}
