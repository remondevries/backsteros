"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";

import { requestDeferredEditorFocus } from "./content-markdown-view-layout";

export type MarkdownDetailEditorMode = "edit" | "preview";

type MarkdownDetailSaveResult =
  | { ok: true }
  | { ok: false; error: string };

type UseMarkdownDetailEditorOptions = {
  initialValue: string;
  save: (
    value: string,
  ) =>
    | MarkdownDetailSaveResult
    | Promise<MarkdownDetailSaveResult>
    | null;
  debounceMs?: number;
  blurOnPreview?: boolean;
  /** When false, skip ⌘/Ctrl+E and ⌘/Ctrl+P window shortcuts. */
  shortcutsEnabled?: boolean;
};

const DEFAULT_SAVE_DEBOUNCE_MS = 700;

export function useMarkdownDetailEditor({
  initialValue,
  save,
  debounceMs = DEFAULT_SAVE_DEBOUNCE_MS,
  blurOnPreview = true,
  shortcutsEnabled = true,
}: UseMarkdownDetailEditorOptions) {
  const [value, setValue] = useState(initialValue);
  const [valueSource, setValueSource] = useState(initialValue);
  const [mode, setMode] = useState<MarkdownDetailEditorMode>("preview");
  const [editorActivated, setEditorActivated] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef(value);
  const modeRef = useRef(mode);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initialValue !== valueSource) {
    // valueSource is still the previous prop value this render — compare
    // against it to detect a real local draft before adopting the remote body.
    const hasUnsavedDraft = value !== valueSource;
    const preserveLocalDraft = hasUnsavedDraft && mode === "edit";
    setValueSource(initialValue);
    if (!preserveLocalDraft) {
      setValue(initialValue);
    }
  }

  useEffect(() => {
    valueRef.current = value;
    modeRef.current = mode;
  }, [mode, value]);

  const saveValue = useCallback(
    async (nextValue: string) => {
      const pendingResult = save(nextValue);
      if (pendingResult === null) {
        return;
      }

      setError(null);
      const result = await pendingResult;
      if (!result.ok) {
        setError(result.error);
      }
    },
    [save],
  );

  const clearScheduledSave = useCallback(() => {
    if (!saveTimeoutRef.current) {
      return;
    }

    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  const saveInTransition = useCallback(
    (nextValue: string) => {
      void saveValue(nextValue);
    },
    [saveValue],
  );

  const flushSave = useCallback(() => {
    clearScheduledSave();
    saveInTransition(valueRef.current);
  }, [clearScheduledSave, saveInTransition]);

  const scheduleSave = useCallback(
    (nextValue: string) => {
      clearScheduledSave();
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        saveInTransition(nextValue);
      }, debounceMs);
    },
    [clearScheduledSave, debounceMs, saveInTransition],
  );

  const handleChange = useCallback(
    (nextValue: string) => {
      valueRef.current = nextValue;
      setValue(nextValue);
      scheduleSave(nextValue);
    },
    [scheduleSave],
  );

  const handleBlur = useCallback(() => {
    flushSave();
  }, [flushSave]);

  const requestEditorFocus = useCallback(() => {
    requestDeferredEditorFocus(setEditorFocusRequest);
  }, []);

  const activateEditMode = useCallback(
    ({ focusEditor = true }: { focusEditor?: boolean } = {}) => {
      modeRef.current = "edit";
      setEditorActivated(true);
      setMode("edit");
      if (focusEditor) {
        requestEditorFocus();
      }
    },
    [requestEditorFocus],
  );

  const switchToEdit = useCallback(() => {
    activateEditMode();
  }, [activateEditMode]);

  const switchToPreview = useCallback(() => {
    modeRef.current = "preview";
    setMode("preview");

    if (blurOnPreview) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      const focusedCm = document.querySelector(
        ".cm-editor.cm-focused .cm-content",
      );
      if (focusedCm instanceof HTMLElement) {
        focusedCm.blur();
      }
    }

    flushSave();
  }, [blurOnPreview, flushSave]);

  const toggleViewMode = useCallback(() => {
    if (modeRef.current === "edit") {
      switchToPreview();
      return;
    }

    activateEditMode();
  }, [activateEditMode, switchToPreview]);

  useEffect(() => {
    return () => {
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  useEffect(() => {
    if (!shortcutsEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || isBlockingModalOpen()) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (modeRef.current === "edit") {
          switchToPreview();
        } else {
          activateEditMode();
        }
        return;
      }

      if (key === "p") {
        event.preventDefault();
        event.stopImmediatePropagation();
        switchToPreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activateEditMode, shortcutsEnabled, switchToPreview]);

  return {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    isPending: false,
    handleChange,
    handleBlur,
    requestEditorFocus,
    activateEditMode,
    switchToEdit,
    switchToPreview,
    toggleViewMode,
  };
}
