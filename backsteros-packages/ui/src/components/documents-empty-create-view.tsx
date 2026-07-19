"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import { ContentDetailIconTitleHeader } from "./content-detail-title-header.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { DocumentOcticon } from "./document-octicon.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { useContentTitleEditorNavigation } from "../use-content-title-editor-navigation.js";

export type DocumentsEmptyCreateResult = {
  id: string;
  path: string;
  contentVersion?: number;
};

export type DocumentsEmptyCreateViewProps = {
  /**
   * Creates the document when leaving the title for the body.
   * Host should navigate to the real detail view afterward (exit this compose shell).
   */
  onCreate: (input: {
    title: string;
    content: string;
  }) => Promise<DocumentsEmptyCreateResult>;
  creating?: boolean;
  /**
   * Increment to re-focus the title (e.g. after delete → empty-create when a
   * closing modal steals focus).
   */
  titleFocusRequest?: number;
};

/**
 * Empty project/knowledge documents pane.
 * Title autofocus matches letter compose. Enter/Tab focuses the body, then
 * creates and hands off to the host — do not keep this view mounted afterward.
 */
export function DocumentsEmptyCreateView({
  onCreate,
  creating = false,
  titleFocusRequest = 0,
}: DocumentsEmptyCreateViewProps) {
  const submittedRef = useRef(false);
  // Stable `value` so OverviewNameEditor autoEdit is not reset on every keystroke.
  const [title, setTitle] = useState("New document");
  const titleRef = useRef(title);
  const markdownRef = useRef("");
  const [focusRequest, setFocusRequest] = useState(
    titleFocusRequest > 0 ? titleFocusRequest : 1,
  );

  useEffect(() => {
    if (titleFocusRequest > 0) {
      setFocusRequest(titleFocusRequest);
    }
  }, [titleFocusRequest]);

  useEffect(() => {
    // Delete-confirm close / route replace often lands after the first focus.
    const timers = [0, 50, 150, 300].map((ms) =>
      window.setTimeout(() => {
        setFocusRequest((count) => count + 1);
      }, ms),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  const {
    value: markdown,
    mode,
    editorActivated,
    editorFocusRequest,
    handleChange,
    requestEditorFocus,
    activateEditMode,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: "",
    save: () => ({ ok: true }),
  });
  markdownRef.current = markdown;

  const { handleLeaveTitleForEditor } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const submitCreate = useCallback(() => {
    if (creating || submittedRef.current) return;
    submittedRef.current = true;
    void Promise.resolve(
      onCreate({
        title: titleRef.current.trim() || "Untitled",
        content: markdownRef.current,
      }),
    ).catch(() => {
      submittedRef.current = false;
    });
  }, [creating, onCreate]);

  const leaveTitleForBody = useCallback(() => {
    // Focus the body first so typing continues without waiting on the network.
    handleLeaveTitleForEditor();
    submitCreate();
  }, [handleLeaveTitleForEditor, submitCreate]);

  const enterBody = useCallback(() => {
    activateEditMode();
    submitCreate();
  }, [activateEditMode, submitCreate]);

  return (
    <div
      className="documents-empty-create"
      data-content-detail
      data-content-view-mode={mode}
    >
      <ContentDetailIconTitleHeader
        icon={
          <div className="document-detail-icon">
            <span
              className="document-detail-icon__button"
              aria-hidden="true"
            >
              <DocumentOcticon
                icon={null}
                size={16}
                className="document-detail-icon__glyph"
              />
            </span>
          </div>
        }
        title={
          <OverviewNameEditor
            value={title}
            entityLabel="Document"
            resetKey="empty-create"
            autoEdit
            renameFocusRequest={focusRequest}
            onDraftChange={(draft) => {
              titleRef.current = draft;
            }}
            onLeaveTitle={() => {
              leaveTitleForBody();
            }}
            onSave={(next) => {
              titleRef.current = next;
              setTitle(next);
              return { ok: true };
            }}
          />
        }
      />

      <ContentMarkdownViewLayout
        mode={mode}
        editorActivated={editorActivated}
        onToggleMode={() => {
          if (mode === "edit") {
            toggleViewMode();
            return;
          }
          enterBody();
        }}
        editor={
          <DocumentMarkdownEditor
            value={markdown}
            onChange={handleChange}
            disabled={creating}
            focusRequest={editorFocusRequest}
            ariaLabel="Document content"
          />
        }
        preview={
          <ContentMarkdownPreviewColumn includeTopInset={false}>
            {markdown.trim() ? (
              <DocumentMarkdownPreview body={markdown} />
            ) : (
              <p className="content-markdown-empty-hint">
                This document is empty.
              </p>
            )}
          </ContentMarkdownPreviewColumn>
        }
        toggle={
          <FloatingPillToggleDock>
            <SegmentedPillToggle
              value={mode}
              options={[
                { value: "preview", label: "Preview" },
                { value: "edit", label: "Edit" },
              ]}
              onChange={(nextMode) => {
                if (nextMode === "edit") {
                  enterBody();
                  return;
                }
                setViewMode(nextMode);
              }}
              ariaLabel="Document view mode"
            />
          </FloatingPillToggleDock>
        }
      />
    </div>
  );
}
