"use client";

import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { getCM, Vim, vim } from "@replit/codemirror-vim";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  createDocumentEditorContentLayoutTheme,
  documentEditorTheme,
} from "../document-editor-theme.js";
import {
  createMentionExtensions,
  MentionMenuController,
} from "../mentions/codemirror/index.js";
import { useMentionCatalogOptional } from "../mentions/mention-catalog-context.js";
import type {
  MentionCatalog,
  MentionSection,
} from "../mentions/mention-menu-types.js";
import { DocumentMentionMenu } from "./document-mention-menu.js";

export type DocumentMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** When set (or provided via MentionCatalogProvider), enables @ mention autocomplete. */
  mentionCatalog?: MentionCatalog;
  /** Optional async search override (e.g. remote). Defaults to provider / local catalog. */
  searchMentionSections?: (query: string) => Promise<MentionSection[]>;
  /** Increment to request editor focus (e.g. when switching to edit mode). */
  focusRequest?: number;
  /**
   * Vim keybindings (Next parity). Default true on desktop/web shells;
   * pass false for mobile/touch-only surfaces.
   */
  vimEnabled?: boolean;
};

type EmptyCaretBox = {
  left: number;
  top: number;
  height: number;
  width: number;
  insertMode: boolean;
};

function ensureDocumentEditorNormalMode(view: EditorView) {
  const cm = getCM(view);
  const vimState = cm?.state.vim;
  if (!cm || !vimState?.insertMode) {
    return;
  }

  Vim.exitInsertMode(cm as Parameters<typeof Vim.exitInsertMode>[0]);
}

function focusEditorView(view: EditorView, vimEnabled: boolean): void {
  const wasAlreadyFocused = view.hasFocus;
  view.focus();
  if (!view.hasFocus) {
    view.contentDOM.focus({ preventScroll: true });
  }
  // view.focus() can set activeElement before CodeMirror's focus observer
  // runs (~10ms). Force an update so `.cm-focused` applies immediately.
  if (view.hasFocus && !view.dom.classList.contains("cm-focused")) {
    view.update([]);
  }
  if (!wasAlreadyFocused && vimEnabled) {
    ensureDocumentEditorNormalMode(view);
  }
}

const EDITOR_FOCUS_MAX_ATTEMPTS = 12;

function scheduleEditorFocusAttempts(
  getView: () => EditorView | null,
  vimEnabled: boolean,
): () => void {
  let cancelled = false;
  let attempts = 0;

  const tryFocus = () => {
    if (cancelled) {
      return;
    }

    const view = getView();

    if (!view) {
      if (attempts < EDITOR_FOCUS_MAX_ATTEMPTS) {
        attempts += 1;
        requestAnimationFrame(tryFocus);
      }
      return;
    }

    const shellHidden =
      view.dom.closest(".content-markdown-view-layout__edit--preparing") !=
        null ||
      view.dom.closest('[aria-hidden="true"]') != null;

    if (
      !shellHidden &&
      (!view.hasFocus || !view.dom.classList.contains("cm-focused"))
    ) {
      focusEditorView(view, vimEnabled);
    }

    const focusedReady =
      view.hasFocus &&
      view.dom.classList.contains("cm-focused") &&
      !shellHidden;

    if (!focusedReady && attempts < EDITOR_FOCUS_MAX_ATTEMPTS) {
      attempts += 1;
      requestAnimationFrame(tryFocus);
    }
  };

  tryFocus();

  return () => {
    cancelled = true;
  };
}

function measureEmptyCaretBox(
  view: EditorView,
  root: HTMLElement,
): EmptyCaretBox | null {
  const coords = view.coordsAtPos(0, 1);
  if (!coords) {
    return null;
  }

  const cm = getCM(view);
  const insertMode = Boolean(cm?.state.vim?.insertMode);
  // Prefer the live vim fat-cursor box (even when we hide it) so size matches.
  const fat = view.dom.querySelector(
    ".cm-vimCursorLayer .cm-fat-cursor",
  ) as HTMLElement | null;
  const charWidth = Math.max(1, view.defaultCharacterWidth || 8);
  // Insert mode uses a thin bar (~CM .cm-cursor); normal mode uses a full cell.
  const width = insertMode
    ? Math.max(2, Math.round(charWidth * 0.2))
    : fat && fat.offsetWidth > 4
      ? fat.offsetWidth
      : Math.round(charWidth);

  // Vim uses coords bottom-top only — do not expand to defaultLineHeight
  // (line-height 1.75 makes that taller than the real block).
  const height =
    fat && fat.offsetHeight > 0
      ? fat.offsetHeight
      : Math.max(1, Math.round(coords.bottom - coords.top));

  const rootRect = root.getBoundingClientRect();
  const top =
    fat && fat.offsetParent
      ? fat.getBoundingClientRect().top - rootRect.top + root.scrollTop
      : coords.top - rootRect.top + root.scrollTop;
  const left =
    fat && fat.offsetParent
      ? fat.getBoundingClientRect().left - rootRect.left + root.scrollLeft
      : coords.left - rootRect.left + root.scrollLeft;

  return {
    left,
    top,
    height,
    width,
    insertMode,
  };
}

/**
 * Shared CodeMirror 6 markdown editor.
 * Mentions: pass `mentionCatalog` or wrap with `MentionCatalogProvider`.
 * Vim: enabled by default (Next non-mobile parity).
 */
export function DocumentMarkdownEditor({
  value,
  onChange,
  onBlur,
  disabled = false,
  ariaLabel = "Document content",
  mentionCatalog: mentionCatalogProp,
  searchMentionSections,
  focusRequest = 0,
  vimEnabled = true,
}: DocumentMarkdownEditorProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [mentionController] = useState(() => new MentionMenuController());
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [emptyCaret, setEmptyCaret] = useState<EmptyCaretBox | null>(null);
  const mentionCatalogFromContext = useMentionCatalogOptional()?.catalog;
  const searchSectionsFromContext =
    useMentionCatalogOptional()?.searchSections;
  const mentionCatalog = mentionCatalogProp ?? mentionCatalogFromContext;
  const mentionsEnabled = mentionCatalog != null;
  const isEmptyDoc = value.length === 0;

  const extensions = useMemo(
    () => [
      // Vim must be registered before other keymaps (see @replit/codemirror-vim README).
      ...(vimEnabled ? [vim({ status: false })] : []),
      markdown(),
      documentEditorTheme,
      createDocumentEditorContentLayoutTheme(),
      EditorView.lineWrapping,
      EditorView.editable.of(!disabled),
      ...(mentionsEnabled ? createMentionExtensions(mentionController) : []),
    ],
    [disabled, mentionController, mentionsEnabled, vimEnabled],
  );

  useLayoutEffect(() => {
    if (!focusRequest) {
      return;
    }

    return scheduleEditorFocusAttempts(
      () => editorRef.current?.view ?? editorView,
      vimEnabled,
    );
  }, [editorView, focusRequest, vimEnabled]);

  useEffect(() => {
    const view = editorView;
    const root = rootRef.current;
    if (!view || !root) {
      setEmptyCaret(null);
      return;
    }

    const syncEmptyCaret = () => {
      const empty = view.state.doc.length === 0;
      const show =
        empty &&
        vimEnabled &&
        !disabled &&
        view.hasFocus &&
        view.dom.classList.contains("cm-focused");

      if (!show) {
        setEmptyCaret(null);
        return;
      }

      setEmptyCaret(measureEmptyCaretBox(view, root));
    };

    syncEmptyCaret();

    const onFocusChange = () => {
      requestAnimationFrame(syncEmptyCaret);
    };

    const cm = getCM(view);
    const onVimModeChange = () => {
      requestAnimationFrame(syncEmptyCaret);
    };

    view.contentDOM.addEventListener("focus", onFocusChange);
    view.contentDOM.addEventListener("blur", onFocusChange);
    view.scrollDOM.addEventListener("scroll", syncEmptyCaret, {
      passive: true,
    });
    window.addEventListener("resize", syncEmptyCaret);
    // Vim mode changes (i / Esc) are not always mirrored in CM updates.
    cm?.on("vim-mode-change", onVimModeChange);

    return () => {
      view.contentDOM.removeEventListener("focus", onFocusChange);
      view.contentDOM.removeEventListener("blur", onFocusChange);
      view.scrollDOM.removeEventListener("scroll", syncEmptyCaret);
      window.removeEventListener("resize", syncEmptyCaret);
      cm?.off("vim-mode-change", onVimModeChange);
    };
  }, [disabled, editorView, isEmptyDoc, vimEnabled]);

  // Re-measure after focus settles (empty docs need the custom block).
  useEffect(() => {
    if (!focusRequest || !editorView || !rootRef.current || !isEmptyDoc) {
      return;
    }

    let cancelled = false;
    const sync = () => {
      if (cancelled || !rootRef.current || !editorView) {
        return;
      }
      if (
        editorView.state.doc.length === 0 &&
        editorView.hasFocus &&
        editorView.dom.classList.contains("cm-focused")
      ) {
        setEmptyCaret(measureEmptyCaretBox(editorView, rootRef.current));
      }
    };

    const raf1 = requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [editorView, focusRequest, isEmptyDoc]);

  return (
    <>
      <div
        ref={rootRef}
        className="document-codemirror"
        data-document-editor-root="codemirror"
        data-empty-doc={isEmptyDoc ? "true" : "false"}
        onBlur={(event) => {
          if (
            onBlur &&
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            onBlur();
          }
        }}
      >
        <CodeMirror
          ref={editorRef}
          value={value}
          height="100%"
          theme="none"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            drawSelection: true,
          }}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={(view) => {
            setEditorView(view);
          }}
          editable={!disabled}
          aria-label={ariaLabel}
        />
        {emptyCaret ? (
          <div
            className={`document-codemirror-empty-caret${
              emptyCaret.insertMode
                ? " document-codemirror-empty-caret--insert"
                : ""
            }`}
            aria-hidden="true"
            data-vim-mode={emptyCaret.insertMode ? "insert" : "normal"}
            style={{
              left: emptyCaret.left,
              top: emptyCaret.top,
              height: emptyCaret.height,
              width: emptyCaret.width,
            }}
          />
        ) : null}
      </div>
      {mentionCatalog ? (
        <DocumentMentionMenu
          view={editorView}
          controller={mentionController}
          catalog={mentionCatalog}
          searchSections={
            searchMentionSections ?? searchSectionsFromContext
          }
        />
      ) : null}
    </>
  );
}
