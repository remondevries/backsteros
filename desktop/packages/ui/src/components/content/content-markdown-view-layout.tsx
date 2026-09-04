"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import { createContentViewModeDoubleClickHandler } from "../../content/content-view-mode-double-click.js";
import { useContentViewModeShortcut } from "../../content/use-content-view-mode-shortcut.js";
import { useMentionCatalogOptional } from "../../mentions/mention-catalog-context.js";
import { rewriteContactMentionTokensToDisplayIds } from "../../mentions/tokens.js";

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
  /**
   * Optional host for keep-alive visibility — when the host is under
   * `[data-keep-alive-hidden]` / `inert`, ⌘E is skipped so another surface wins.
   */
  hostRef?: RefObject<Element | null>;
};

const DEFAULT_SAVE_DEBOUNCE_MS = 700;

/**
 * Shared edit/preview state for markdown detail views.
 * ⌘/Ctrl+E toggles edit ↔ preview (JS keydown + Tauri Edit menu, so it still
 * works while CodeMirror is focused); ⌘/Ctrl+P forces preview (Next parity).
 */
export function useMarkdownDetailEditor({
  initialValue,
  save,
  debounceMs = DEFAULT_SAVE_DEBOUNCE_MS,
  blurOnPreview = true,
  shortcutsEnabled = true,
  hostRef,
}: UseMarkdownDetailEditorOptions) {
  const mentionCatalog = useMentionCatalogOptional()?.catalog;
  const [value, setValue] = useState(initialValue);
  const [valueSource, setValueSource] = useState(initialValue);
  const [mode, setMode] = useState<MarkdownDetailEditorMode>("preview");
  const [editorActivated, setEditorActivated] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const valueRef = useRef(value);
  const modeRef = useRef(mode);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactRewriteCatalogRef = useRef(mentionCatalog);

  const normalizeContactMentions = useCallback(
    (markdown: string) => {
      const catalog = contactRewriteCatalogRef.current;
      if (!catalog || catalog.contacts.length === 0) {
        return markdown;
      }
      return rewriteContactMentionTokensToDisplayIds(markdown, catalog);
    },
    [],
  );

  if (initialValue !== valueSource) {
    // valueSource is still the previous prop value this render — compare
    // against it to detect a real local draft before adopting the remote body.
    const hasUnsavedDraft = value !== valueSource;
    const preserveLocalDraft = hasUnsavedDraft && mode === "edit";
    setValueSource(initialValue);
    if (!preserveLocalDraft) {
      setValue(normalizeContactMentions(initialValue));
    }
  }

  useEffect(() => {
    valueRef.current = value;
    modeRef.current = mode;
  }, [mode, value]);

  const saveValue = useCallback(
    async (nextValue: string) => {
      const normalized = normalizeContactMentions(nextValue);
      if (normalized !== nextValue) {
        valueRef.current = normalized;
        setValue(normalized);
      }
      const pendingResult = save(normalized);
      if (pendingResult === null) {
        return;
      }

      setError(null);
      const result = await pendingResult;
      if (!result.ok) {
        setError(result.error);
      }
    },
    [normalizeContactMentions, save],
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

  useEffect(() => {
    contactRewriteCatalogRef.current = mentionCatalog;
    if (!mentionCatalog || mentionCatalog.contacts.length === 0) {
      return;
    }
    const current = valueRef.current;
    const rewritten = rewriteContactMentionTokensToDisplayIds(
      current,
      mentionCatalog,
    );
    if (rewritten === current) {
      return;
    }
    valueRef.current = rewritten;
    setValue(rewritten);
    scheduleSave(rewritten);
  }, [mentionCatalog, scheduleSave]);

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

  const contentViewModeHostRef = useContentViewModeShortcut({
    enabled: shortcutsEnabled,
    onToggle: toggleViewMode,
    onForcePreview: switchToPreview,
    hostRef,
  });

  useEffect(() => {
    return () => {
      clearScheduledSave();
    };
  }, [clearScheduledSave]);

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
    contentViewModeHostRef,
  };
}
