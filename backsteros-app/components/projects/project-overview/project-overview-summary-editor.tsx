"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { updateProjectSummaryAction } from "@/lib/mutations/projects";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { updateLocalProjectSummary } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { useAutosizeTextarea } from "@/lib/ui/use-autosize-textarea";

const SAVE_DEBOUNCE_MS = 800;
const SUMMARY_MIN_HEIGHT_PX = 24;

type ProjectOverviewSummaryEditorProps = {
  projectId: string;
  value: string;
  /** Increment to focus the summary field (e.g. Tab from project title). */
  focusRequest?: number;
  /** Shift+Tab in the summary focuses the project title field. */
  onShiftTabFocusTitle?: () => void;
};

export function ProjectOverviewSummaryEditor({
  projectId,
  value,
  focusRequest = 0,
  onShiftTabFocusTitle,
}: ProjectOverviewSummaryEditorProps) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useLatestRef(draft);
  const { textareaRef } = useAutosizeTextarea({
    value: draft,
    minHeight: SUMMARY_MIN_HEIGHT_PX,
  });

  const entitySyncKey = projectId;
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
            updateLocalProjectSummary({
              projectId,
              summary: content,
            }),
          () =>
            updateProjectSummaryAction({
              projectId,
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
    [projectId],
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

  useLayoutEffect(() => {
    if (!focusRequest) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusRequest, textareaRef]);

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
      persist(draftRef.current);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              textareaRef.current?.blur();
              return;
            }
            if (
              event.key === "Tab" &&
              event.shiftKey &&
              onShiftTabFocusTitle
            ) {
              event.preventDefault();
              onShiftTabFocusTitle();
            }
          }}
          onFocus={() => {
            setUserEdited(true);
          }}
          onBlur={handleBlur}
          disabled={isPending}
          rows={1}
          placeholder="Add a project summary…"
          className={`w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-sm leading-relaxed placeholder:text-foreground/40 focus:outline-none disabled:opacity-60 ${
            draft.trim().length > 0 ? "text-foreground" : "text-foreground/50"
          }`}
        />
        {dirty || isPending ? (
          <span className="shrink-0 pt-0.5 text-[11px] text-foreground/50">
            {isPending ? "Saving…" : "Unsaved"}
          </span>
        ) : null}
      </div>
      {saveError ? (
        <p className="text-xs text-red-400" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
