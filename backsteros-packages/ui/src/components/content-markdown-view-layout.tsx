"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { createContentViewModeDoubleClickHandler } from "../content-view-mode-double-click.js";
import { isBlockingModalOpen } from "../shortcut-guards.js";

export type ContentMarkdownViewMode = "edit" | "preview";

export type ContentMarkdownViewLayoutProps = {
  mode: ContentMarkdownViewMode;
  editorActivated: boolean;
  editHeader?: ReactNode;
  editor: ReactNode;
  preview: ReactNode;
  /** Optional Edit/Preview dock (positioned inside this layout). */
  toggle?: ReactNode;
  onToggleMode?: () => void;
};

export function ContentMarkdownPreviewColumn({
  children,
  includeTopInset = true,
}: {
  children: ReactNode;
  includeTopInset?: boolean;
}) {
  return (
    <div
      className={`content-markdown-preview-column${
        includeTopInset ? "" : " content-markdown-preview-column--no-top"
      }`}
    >
      {children}
    </div>
  );
}

/** Title block above markdown body — web `mb-6` title→body gap. */
export function ContentMarkdownPreviewTitleSlot({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="content-detail-title-slot">{children}</div>;
}

/** Preview column with optional title block above body (letters, documents). */
export function ContentMarkdownPreviewBody({
  titleHeader,
  children,
}: {
  titleHeader?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ContentMarkdownPreviewColumn>
      {titleHeader ? (
        <ContentMarkdownPreviewTitleSlot>
          {titleHeader}
        </ContentMarkdownPreviewTitleSlot>
      ) : null}
      {children}
    </ContentMarkdownPreviewColumn>
  );
}

const EDITOR_READY_FALLBACK_MS = 2000;

function markEditorSurfaceReady(setReady: (ready: boolean) => void) {
  // Wait two frames so CodeMirror can inject theme styles before reveal.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setReady(true);
    });
  });
}

/**
 * Standard edit/preview shell (Next ContentMarkdownViewLayout parity):
 * keeps preview visible until CodeMirror has mounted on first edit switch.
 */
export function ContentMarkdownViewLayout({
  mode,
  editorActivated,
  editHeader,
  editor,
  preview,
  toggle,
  onToggleMode,
}: ContentMarkdownViewLayoutProps) {
  const editorShellRef = useRef<HTMLDivElement>(null);
  const [editorSurfaceReady, setEditorSurfaceReady] = useState(false);

  useEffect(() => {
    if (!editorActivated) {
      setEditorSurfaceReady(false);
      return;
    }

    if (editorSurfaceReady) {
      return;
    }

    const root = editorShellRef.current;
    if (!root) {
      return;
    }

    const revealIfMounted = () => {
      if (root.querySelector(".cm-editor")) {
        markEditorSurfaceReady(setEditorSurfaceReady);
        return true;
      }
      return false;
    };

    if (revealIfMounted()) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (revealIfMounted()) {
        observer.disconnect();
      }
    });
    observer.observe(root, { childList: true, subtree: true });

    const fallback = window.setTimeout(() => {
      setEditorSurfaceReady(true);
      observer.disconnect();
    }, EDITOR_READY_FALLBACK_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [editorActivated, editorSurfaceReady]);

  // Preview hides the editor with display:none but CodeMirror can keep DOM
  // focus and swallow keys (e.g. `d` delete). Blur + inert while previewing.
  useEffect(() => {
    if (mode !== "preview") return;
    const root = editorShellRef.current;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      root?.contains(active)
    ) {
      active.blur();
    }
    const focusedCm = root?.querySelector(".cm-editor.cm-focused .cm-content");
    if (focusedCm instanceof HTMLElement) {
      focusedCm.blur();
    }
  }, [mode]);

  const handleContentDoubleClick = onToggleMode
    ? createContentViewModeDoubleClickHandler(mode, onToggleMode)
    : undefined;

  const editing = mode === "edit";
  const showEditorSurface = editing && editorSurfaceReady;
  const showPreview = mode === "preview" || (editing && !editorSurfaceReady);

  return (
    <div
      className="content-markdown-view-layout"
      data-mode={mode}
    >
      {editorActivated ? (
        <div
          ref={editorShellRef}
          className={
            showEditorSurface
              ? "content-markdown-view-layout__edit"
              : editing
                ? "content-markdown-view-layout__edit content-markdown-view-layout__edit--preparing"
                : "content-markdown-view-layout__edit content-markdown-view-layout__edit--hidden"
          }
          aria-hidden={!showEditorSurface}
          inert={!showEditorSurface ? true : undefined}
          onDoubleClick={handleContentDoubleClick}
        >
          {editHeader}
          <div className="content-markdown-editor-column">{editor}</div>
        </div>
      ) : null}
      {showPreview ? (
        <div
          className="content-markdown-view-layout__preview"
          data-content-preview-scroll=""
          onDoubleClick={handleContentDoubleClick}
        >
          {preview}
        </div>
      ) : null}
      {toggle}
    </div>
  );
}

export function requestDeferredEditorFocus(
  setEditorFocusRequest: Dispatch<SetStateAction<number>>,
): void {
  setEditorFocusRequest((count) => count + 1);
  requestAnimationFrame(() => {
    setEditorFocusRequest((count) => count + 1);
  });
}

export type MarkdownDetailEditorMode = ContentMarkdownViewMode;

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
  /** Blur the active element when switching to preview (keeps `d` delete etc. working). */
  blurOnPreview?: boolean;
  /**
   * When false, skip ⌘/Ctrl+E and ⌘/Ctrl+P (e.g. project description while
   * another section's document editor is active).
   */
  shortcutsEnabled?: boolean;
};

const DEFAULT_SAVE_DEBOUNCE_MS = 700;

/**
 * Shared edit/preview state for markdown detail views.
 * ⌘/Ctrl+E toggles edit ↔ preview; ⌘/Ctrl+P forces preview (Next parity).
 */
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

  const handleBlurSave = useCallback(() => {
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
      // Hidden edit shells use display:none; CodeMirror can keep focus and
      // swallow shortcuts like `d` (delete) while preview is showing.
      const focusedCm = document.querySelector(
        ".cm-editor.cm-focused .cm-content",
      );
      if (focusedCm instanceof HTMLElement) {
        focusedCm.blur();
      }
    }

    flushSave();
  }, [blurOnPreview, flushSave]);

  const setViewMode = useCallback(
    (next: MarkdownDetailEditorMode) => {
      if (next === "edit") {
        activateEditMode();
        return;
      }
      switchToPreview();
    },
    [activateEditMode, switchToPreview],
  );

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
    handleBlurSave,
    requestEditorFocus,
    activateEditMode,
    switchToEdit,
    switchToPreview,
    setViewMode,
    toggleViewMode,
  };
}
