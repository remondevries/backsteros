"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { FloatingPillToggleDock } from "@/components/ui/floating-pill-toggle-dock";
import { createContentViewModeDoubleClickHandler } from "@/lib/content/content-view-mode-double-click";
import {
  CONTENT_DETAIL_TITLE_BODY_GAP_CLASS,
  CONTENT_DETAIL_TOP_PADDING_CLASS,
  DOCUMENT_CONTENT_MAX_WIDTH,
} from "@/lib/documents/content-layout";

export {
  CONTENT_VIEW_MODE_TOGGLE_DOCK_CLASS,
  FLOATING_PILL_TOGGLE_DOCK_CLASS,
} from "@/components/ui/floating-pill-toggle-dock";

type ContentMarkdownViewLayoutProps = {
  mode: "edit" | "preview";
  editorActivated: boolean;
  editHeader?: ReactNode;
  editor: ReactNode;
  preview: ReactNode;
  toggle?: ReactNode;
  /** Double-click content to switch between edit and preview. */
  onToggleMode?: () => void;
  /** Extra bottom padding in preview scroll (e.g. journal due tasks). */
  previewScrollClassName?: string;
};

/** Shared preview column shell (letters, documents, tasks). */
export function ContentMarkdownPreviewColumn({
  children,
  includeTopInset = true,
  inlinePadding = true,
  className,
}: {
  children: ReactNode;
  /** False when a title header already sits above the layout (tasks, compose). */
  includeTopInset?: boolean;
  /** When false, omit horizontal padding (parent supplies inset). */
  inlinePadding?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full pb-8 ${
        inlinePadding ? "px-4" : ""
      } ${includeTopInset ? CONTENT_DETAIL_TOP_PADDING_CLASS : ""}${
        className ? ` ${className}` : ""
      }`
        .replace(/\s+/g, " ")
        .trim()}
      style={inlinePadding ? { maxWidth: DOCUMENT_CONTENT_MAX_WIDTH } : undefined}
    >
      {children}
    </div>
  );
}

export function ContentMarkdownPreviewTitleSlot({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={CONTENT_DETAIL_TITLE_BODY_GAP_CLASS}>{children}</div>
  );
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
        <ContentMarkdownPreviewTitleSlot>{titleHeader}</ContentMarkdownPreviewTitleSlot>
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
 * Standard edit/preview shell used by tasks and documents:
 * full-height CodeMirror in edit mode; scrollable preview in preview mode.
 * Desktop-only: toggle docks absolute bottom-right (no mobile portal).
 *
 * On the first switch to edit, keeps the preview visible until CodeMirror has
 * mounted so the dynamic import / theme paint does not flash wrong colors.
 */
export function ContentMarkdownViewLayout({
  mode,
  editorActivated,
  editHeader,
  editor,
  preview,
  toggle,
  onToggleMode,
  previewScrollClassName = "min-h-0 flex-1 overflow-y-auto",
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

  useEffect(() => {
    if (mode !== "preview") return;
    const root = editorShellRef.current;
    const active = document.activeElement;
    if (active instanceof HTMLElement && root?.contains(active)) {
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
    <div className="content-markdown-view-layout relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {editorActivated ? (
        <div
          ref={editorShellRef}
          className={
            showEditorSurface
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : editing
                ? "pointer-events-none invisible absolute inset-0 -z-10 flex min-h-0 flex-1 flex-col overflow-hidden"
                : "hidden"
          }
          aria-hidden={!showEditorSurface}
          inert={!showEditorSurface ? true : undefined}
          onDoubleClick={handleContentDoubleClick}
        >
          {editHeader}
          <div
            className="mx-auto box-border flex min-h-0 w-full min-w-0 flex-1 flex-col px-4"
            style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
          >
            <div className="min-h-0 min-w-0 flex-1">{editor}</div>
          </div>
        </div>
      ) : null}
      {showPreview ? (
        <div
          className={previewScrollClassName}
          data-content-preview-scroll
          onDoubleClick={handleContentDoubleClick}
        >
          {preview}
        </div>
      ) : null}

      {toggle ? <FloatingPillToggleDock>{toggle}</FloatingPillToggleDock> : null}
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
