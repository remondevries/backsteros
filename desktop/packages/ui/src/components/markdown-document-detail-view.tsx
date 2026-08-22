"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useContentTitleEditorNavigation } from "../content/use-content-title-editor-navigation.js";
import {
  ContentMarkdownPreviewBody,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import {
  ContentDetailStaticTitle,
  ContentDetailTitleHeader,
  buildContentIconTitleHeaders,
} from "./content-detail-title-header.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";

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
  onSave,
  onSaveTitle,
}: MarkdownDocumentDetailViewProps) {
  const [title, setTitle] = useState(initialTitle);
  const [prevKey, setPrevKey] = useState(resetKey ?? initialTitle);
  const [prevInitialTitle, setPrevInitialTitle] = useState(initialTitle);
  const startedInEditRef = useRef(false);
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
  });

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
        className="markdown-document-embedded markdown-document-embedded--document-scroll"
        data-content-view-mode={mode}
      >
        <div className="markdown-document-scrollport">{scrollBody}</div>
        {viewModeDock}
      </div>
    );
  }

  return (
    <div
      className="inbox-detail-layout"
      data-content-detail
      data-content-view-mode={mode}
      style={{ position: "relative" }}
    >
      <div className="inbox-detail-body inbox-detail-body--document markdown-document-scrollport">
        {scrollBody}
      </div>
      {viewModeDock}
    </div>
  );
}
