import { useCallback, useEffect, useRef, useState } from "react";

import type { BacksterosMarkdownDescriptionMode } from "./backsteros-markdown-description";

const DEFAULT_SAVE_DEBOUNCE_MS = 700;

export type UseBacksterosMarkdownDetailEditorOptions = {
  readonly initialValue: string;
  readonly save: (nextValue: string) => Promise<void> | void;
  readonly debounceMs?: number;
};

/**
 * Desktop-parity description editor: Preview/Edit toggle with debounced
 * auto-save (and flush on blur / switch to preview). No Save/Cancel chrome.
 */
export function useBacksterosMarkdownDetailEditor({
  initialValue,
  save,
  debounceMs = DEFAULT_SAVE_DEBOUNCE_MS,
}: UseBacksterosMarkdownDetailEditorOptions) {
  const [value, setValue] = useState(initialValue);
  const [valueSource, setValueSource] = useState(initialValue);
  const [mode, setMode] = useState<BacksterosMarkdownDescriptionMode>("preview");
  const valueRef = useRef(value);
  const modeRef = useRef(mode);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (initialValue !== valueSource) {
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

  const clearScheduledSave = useCallback(() => {
    if (!saveTimeoutRef.current) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = null;
  }, []);

  const saveValue = useCallback(
    async (nextValue: string) => {
      await save(nextValue);
    },
    [save],
  );

  const flushSave = useCallback(() => {
    clearScheduledSave();
    void saveValue(valueRef.current);
  }, [clearScheduledSave, saveValue]);

  const scheduleSave = useCallback(
    (nextValue: string) => {
      clearScheduledSave();
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void saveValue(nextValue);
      }, debounceMs);
    },
    [clearScheduledSave, debounceMs, saveValue],
  );

  const handleChange = useCallback(
    (nextValue: string) => {
      valueRef.current = nextValue;
      setValue(nextValue);
      scheduleSave(nextValue);
    },
    [scheduleSave],
  );

  const handleBlurSave = useCallback(() => {
    flushSave();
  }, [flushSave]);

  const setViewMode = useCallback(
    (next: BacksterosMarkdownDescriptionMode) => {
      if (next === "edit") {
        modeRef.current = "edit";
        setMode("edit");
        return;
      }

      modeRef.current = "preview";
      setMode("preview");

      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        active.blur();
      }
      const focusedCm = document.querySelector(".cm-editor.cm-focused .cm-content");
      if (focusedCm instanceof HTMLElement) {
        focusedCm.blur();
      }

      flushSave();
    },
    [flushSave],
  );

  const toggleViewMode = useCallback(() => {
    if (modeRef.current === "edit") {
      setViewMode("preview");
      return;
    }
    setViewMode("edit");
  }, [setViewMode]);

  useEffect(() => {
    return () => {
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

  return {
    value,
    mode,
    handleChange,
    handleBlurSave,
    setViewMode,
    toggleViewMode,
  };
}
