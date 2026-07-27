"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { overviewDetailsInputClassName } from "@/components/overview/overview-details-field";
import { updateOrganizationSummaryAction } from "@/lib/mutations/organizations";
import { updateLocalOrganizationSummary } from "@/lib/sync/local-organization-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";

const SAVE_DEBOUNCE_MS = 800;

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
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        id="organization-notes"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          setUserEdited(true);
        }}
        onBlur={handleBlur}
        rows={3}
        placeholder="Add notes…"
        aria-label="Organization notes"
        className={`${overviewDetailsInputClassName} min-h-16 resize-y leading-relaxed`}
      />
      {saveError ? (
        <p className="text-xs text-red-400" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
