"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useContentTitleEditorNavigation } from "../../content/use-content-title-editor-navigation.js";
import {
  deriveDocumentHeadingMinimapItems,
  DOCUMENT_HEADING_MINIMAP_MIN_ITEMS,
  resolveDocumentHeadingMinimapHasPersistentGutter,
  resolveDocumentHeadingMinimapHitStripWidth,
  type DocumentHeadingMinimapItem,
} from "../../documents/document-heading-minimap.js";
import {
  ContentMarkdownPreviewBody,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "../content/content-markdown-view-layout.js";
import {
  ContentDetailStaticTitle,
  ContentDetailTitleHeader,
  buildContentIconTitleHeaders,
} from "../content/content-detail-title-header.js";
import { DocumentHeadingMinimap } from "./document-heading-minimap.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { useListKeyboardNavigationZone } from "../list-nav/list-keyboard-navigation-provider.js";
import {
  registerCodebaseDetailEnterFocus,
  registerCodebaseDetailLeaveFocus,
} from "../../codebase/codebase-detail-focus.js";

export type MarkdownDocumentDetailViewProps = {
  sectionLabel: string;
  title: string;
  initialBody?: string;
  resetKey?: string;
  /** Open in edit mode once on mount (e.g. after empty-create handoff). */
  startInEditMode?: boolean;
  /** Optional content above the title (e.g. journal Whoop rings). */
  leading?: ReactNode;
  /** Optional icon chip above the title (Next document/journal parity). */
  icon?: ReactNode;
  /** Optional content below the markdown body (e.g. journal due tasks). Shown in preview mode. */
  footer?: ReactNode;
  /**
   * When true, omit the outer inbox-detail chrome (parent supplies the page
   * shell). With `leading`, Whoop scrolls inside this view with the body.
   */
  embedded?: boolean;
  /** Next uses a static title in preview and an editor only in edit mode. */
  previewTitleEditable?: boolean;
  /** When false, title is read-only in both edit and preview (journal date titles). */
  titleEditable?: boolean;
  /** When false, skip ⌘E / ⌘P (keep-alive pane not visible). */
  shortcutsEnabled?: boolean;
  onSave?: (
    value: string,
  ) =>
    | void
    | { ok: true }
    | { ok: false; error: string }
    | Promise<void | { ok: true } | { ok: false; error: string }>;
  onSaveTitle?: (
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
};

/** Journal / knowledge style detail with edit/preview (no properties rail). */
export function MarkdownDocumentDetailView({
  sectionLabel,
  title: initialTitle,
  initialBody = "",
  resetKey,
  startInEditMode = false,
  leading,
  icon,
  footer,
  embedded = false,
  previewTitleEditable = true,
  titleEditable = true,
  shortcutsEnabled = true,
  onSave,
  onSaveTitle,
}: MarkdownDocumentDetailViewProps) {
  const [title, setTitle] = useState(initialTitle);
  const [prevKey, setPrevKey] = useState(resetKey ?? initialTitle);
  const [prevInitialTitle, setPrevInitialTitle] = useState(initialTitle);
  const startedInEditRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollportRef = useRef<HTMLDivElement>(null);
  const minimapRafRef = useRef<number | null>(null);
  const [hasPersistentGutter, setHasPersistentGutter] = useState(false);
  const [hitStripWidth, setHitStripWidth] = useState(0);
  const [inViewIds, setInViewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const syncKey = resetKey ?? initialTitle;
  if (syncKey !== prevKey) {
    setPrevKey(syncKey);
    setTitle(initialTitle);
    setPrevInitialTitle(initialTitle);
    startedInEditRef.current = false;
  } else if (initialTitle !== prevInitialTitle) {
    setPrevInitialTitle(initialTitle);
    setTitle(initialTitle);
  }

  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    handleChange,
    handleBlurSave,
    requestEditorFocus,
    activateEditMode,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: initialBody,
    save: (next) => {
      if (!onSave) {
        return { ok: true };
      }
      return Promise.resolve(onSave(next))
        .then((result) => result ?? { ok: true as const })
        .catch((reason: unknown) => ({
          ok: false as const,
          error:
            reason instanceof Error ? reason.message : "Could not save document.",
        }));
    },
    shortcutsEnabled,
    hostRef: shellRef,
  });

  const { setActiveZone } = useListKeyboardNavigationZone();

  useEffect(() => {
    if (!shortcutsEnabled) return;
    return registerCodebaseDetailEnterFocus(() => {
      const root = shellRef.current;
      if (!root?.closest("[data-codebase-workbench]")) return false;
      activateEditMode({ focusEditor: true });
      return true;
    });
  }, [activateEditMode, shortcutsEnabled]);

  useEffect(() => {
    if (!shortcutsEnabled) return;
    return registerCodebaseDetailLeaveFocus(() => {
      const root = shellRef.current;
      if (!root?.closest("[data-codebase-workbench]")) return false;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active.closest(".cm-editor, .cm-content")
      ) {
        active.blur();
      }
      if (mode === "edit") {
        setViewMode("preview");
      }
      setActiveZone("content", { activate: true });
      return true;
    });
  }, [mode, setActiveZone, setViewMode, shortcutsEnabled]);

  useEffect(() => {
    if (!startInEditMode || startedInEditRef.current) return;
    startedInEditRef.current = true;
    activateEditMode();
  }, [activateEditMode, startInEditMode]);

  const {
    titleRenameFocusRequest,
    handleLeaveTitleForEditor,
  } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const headingMinimapItems = useMemo(() => {
    if (mode !== "preview") return [] as DocumentHeadingMinimapItem[];
    return deriveDocumentHeadingMinimapItems(value);
  }, [mode, value]);

  const showHeadingMinimap =
    mode === "preview" &&
    headingMinimapItems.length >= DOCUMENT_HEADING_MINIMAP_MIN_ITEMS;

  const updateMinimapInView = useCallback(() => {
    const scroller = scrollportRef.current;
    if (!scroller || headingMinimapItems.length === 0) {
      setInViewIds(new Set());
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    const next = new Set<string>();
    for (const item of headingMinimapItems) {
      const section = scroller.querySelector<HTMLElement>(
        `[data-document-heading="${CSS.escape(item.id)}"]`,
      );
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom) {
        next.add(item.id);
      }
    }
    setInViewIds((current) => {
      if (current.size === next.size) {
        let same = true;
        for (const id of next) {
          if (!current.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return current;
      }
      return next;
    });
  }, [headingMinimapItems]);

  const scheduleMinimapInView = useCallback(() => {
    if (minimapRafRef.current != null) return;
    minimapRafRef.current = window.requestAnimationFrame(() => {
      minimapRafRef.current = null;
      updateMinimapInView();
    });
  }, [updateMinimapInView]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const syncGutter = () => {
      const width = shell.getBoundingClientRect().width;
      setHasPersistentGutter(
        resolveDocumentHeadingMinimapHasPersistentGutter(width),
      );
      setHitStripWidth(resolveDocumentHeadingMinimapHitStripWidth(width));
    };
    syncGutter();
    const observer = new ResizeObserver(syncGutter);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [syncKey, showHeadingMinimap]);

  useEffect(() => {
    const scroller = scrollportRef.current;
    if (!scroller || !showHeadingMinimap) {
      setInViewIds(new Set());
      return;
    }
    updateMinimapInView();
    const onScroll = () => scheduleMinimapInView();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const frame = requestAnimationFrame(updateMinimapInView);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      if (minimapRafRef.current != null) {
        cancelAnimationFrame(minimapRafRef.current);
        minimapRafRef.current = null;
      }
    };
  }, [
    scheduleMinimapInView,
    showHeadingMinimap,
    syncKey,
    updateMinimapInView,
    value,
  ]);

  const jumpToHeading = useCallback((item: DocumentHeadingMinimapItem) => {
    const scroller = scrollportRef.current;
    if (!scroller) return;
    const section = scroller.querySelector<HTMLElement>(
      `[data-document-heading="${CSS.escape(item.id)}"]`,
    );
    if (!section) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    scroller.scrollTop += sectionRect.top - scrollerRect.top - 16;
  }, []);

  void sectionLabel;

  const canEditTitle = titleEditable;
  const canEditPreviewTitle = titleEditable && previewTitleEditable;

  const renderTitleEditor = (previewStatic: boolean) =>
    canEditTitle && !(previewStatic && !canEditPreviewTitle) ? (
      <OverviewNameEditor
        value={title}
        entityLabel={sectionLabel.replace(/s$/, "") || "Document"}
        resetKey={syncKey}
        renameFocusRequest={titleRenameFocusRequest}
        onLeaveTitle={() => handleLeaveTitleForEditor()}
        onSave={async (next) => {
          if (!onSaveTitle) {
            setTitle(next);
            return { ok: true };
          }
          const result = await onSaveTitle(next);
          if (result.ok) setTitle(next);
          return result;
        }}
      />
    ) : (
      <ContentDetailStaticTitle>{title}</ContentDetailStaticTitle>
    );

  // Separate edit/preview title instances — sharing one element remounts on
  // mode switch and drops ⌘R focus into the body editor.
  const { editHeader, previewTitleHeader } = icon
    ? buildContentIconTitleHeaders({
        icon,
        editTitle: renderTitleEditor(false),
        previewTitle: renderTitleEditor(true),
      })
    : {
        editHeader: (
          <ContentDetailTitleHeader>
            {renderTitleEditor(false)}
          </ContentDetailTitleHeader>
        ),
        previewTitleHeader: (
          <ContentDetailTitleHeader inlinePadding={false}>
            {renderTitleEditor(true)}
          </ContentDetailTitleHeader>
        ),
      };

  const markdown = (
    <>
      <ContentMarkdownViewLayout
        mode={mode}
        editorActivated={editorActivated}
        editHeader={editHeader}
        onToggleMode={toggleViewMode}
        editor={
          <DocumentMarkdownEditor
            value={value}
            onChange={handleChange}
            onBlur={handleBlurSave}
            focusRequest={editorFocusRequest}
            ariaLabel={`${sectionLabel} content`}
            scrollWithContent
          />
        }
        preview={
          <>
            <ContentMarkdownPreviewBody titleHeader={previewTitleHeader}>
              {value.trim() ? (
                <DocumentMarkdownPreview
                  body={value}
                  onChange={handleChange}
                />
              ) : (
                <p className="content-markdown-empty-hint">
                  This document is empty.
                </p>
              )}
            </ContentMarkdownPreviewBody>
            {footer}
          </>
        }
      />
      {error ? (
        <p className="overview-empty" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );

  const leadingBlock = leading ? (
    <div className="markdown-document-leading">{leading}</div>
  ) : null;

  const viewModeDock = (
    <FloatingPillToggleDock>
      <SegmentedPillToggle
        value={mode}
        options={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
        ]}
        onChange={setViewMode}
        ariaLabel="Document view mode"
      />
    </FloatingPillToggleDock>
  );

  const headingMinimap = showHeadingMinimap ? (
    <DocumentHeadingMinimap
      items={headingMinimapItems}
      hasPersistentGutter={hasPersistentGutter}
      hitStripWidth={hitStripWidth}
      inViewIds={inViewIds}
      onSelect={jumpToHeading}
    />
  ) : null;

  // Full-width scrollport (sibling of the Edit/Preview dock) so the scrollbar
  // sits on the far right of the pane — not beside the centered 800px column.
  // Leading (e.g. Whoop) scrolls away with the body; the dock stays pinned.
  const scrollBody = (
    <>
      {leadingBlock}
      {markdown}
    </>
  );

  if (embedded) {
    return (
      <div
        ref={shellRef}
        className="markdown-document-embedded markdown-document-embedded--document-scroll"
        data-content-view-mode={mode}
      >
        {headingMinimap}
        <div ref={scrollportRef} className="markdown-document-scrollport">
          {scrollBody}
        </div>
        {viewModeDock}
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className="inbox-detail-layout"
      data-content-detail
      data-content-view-mode={mode}
      style={{ position: "relative" }}
    >
      {headingMinimap}
      <div
        ref={scrollportRef}
        className="inbox-detail-body inbox-detail-body--document markdown-document-scrollport"
      >
        {scrollBody}
      </div>
      {viewModeDock}
    </div>
  );
}
