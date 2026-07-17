"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { updateOrganizationSummaryAction } from "@/lib/mutations/organizations";
import { updateLocalOrganizationSummary } from "@/lib/sync/local-organization-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { useAutosizeTextarea } from "@/lib/ui/use-autosize-textarea";

const SAVE_DEBOUNCE_MS = 800;
const SUMMARY_MIN_HEIGHT_PX = 24;

type OrganizationOverviewSummaryEditorProps = {
  organizationId: string;
  value: string;
};

export function OrganizationOverviewSummaryEditor({
  organizationId,
  value,
}: OrganizationOverviewSummaryEditorProps) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { textareaRef } = useAutosizeTextarea({
    value: draft,
    minHeight: SUMMARY_MIN_HEIGHT_PX,
  });

  const entitySyncKey = organizationId;
  const [prevEntitySyncKey, setPrevEntitySyncKey] = useState(entitySyncKey);
  if (entitySyncKey !== prevEntitySyncKey) {
    setPrevEntitySyncKey(entitySyncKey);
    setDirty(false);
    setSaveError(null);
    setDraft(value);
    setUserEdited(false);
  }

  if (!dirty && draft !== value) {
    setDraft(value);
  }

  const persist = useCallback(
    (content: string) => {
      startTransition(async () => {
        setSaveError(null);
        const result = await runEntityPersist(
          () =>
            updateLocalOrganizationSummary({
              organizationId,
              summary: content,
            }),
          () =>
            updateOrganizationSummaryAction({
              organizationId,
              summary: content,
            }),
        );

        if (!result.ok) {
          setSaveError(result.error);
          return;
        }

        setDirty(false);
      });
    },
    [organizationId],
  );

  const scheduleSave = useCallback(
    (content: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        persist(content);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    [],
  );

  function handleChange(nextValue: string) {
    setDraft(nextValue);
    if (!userEdited) {
      return;
    }

    setDirty(true);
    setSaveError(null);
    scheduleSave(nextValue);
  }

  function handleBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (dirty && userEdited) {
      persist(draft);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          setUserEdited(true);
        }}
        onBlur={handleBlur}
        disabled={isPending}
        rows={1}
        placeholder="Add notes about this organization…"
        className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed placeholder:text-foreground/40 focus:outline-none disabled:opacity-60 ${
          draft.trim().length > 0 ? "text-foreground" : "text-foreground/50"
        }`}
      />
      {saveError ? (
        <p className="text-xs text-red-400" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
