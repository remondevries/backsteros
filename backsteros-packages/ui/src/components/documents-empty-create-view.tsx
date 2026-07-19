"use client";

import { useState } from "react";

import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import {
  CONTENT_DETAIL_TITLE_CLASS,
  ContentDetailIconTitleHeader,
} from "./content-detail-title-header.js";
import { DocumentIcon } from "./document-icon.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";

export type DocumentsEmptyCreateViewProps = {
  onCreate: (input: { title: string; content: string }) => void | Promise<void>;
  creating?: boolean;
};

/**
 * Empty project/knowledge documents pane — mirrors web DocumentsEmptyCreatePrompt
 * (icon + title + markdown shell + Create document).
 */
export function DocumentsEmptyCreateView({
  onCreate,
  creating = false,
}: DocumentsEmptyCreateViewProps) {
  const [title, setTitle] = useState("New document");
  const {
    value: markdown,
    mode,
    editorActivated,
    editorFocusRequest,
    handleChange,
    activateEditMode,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: "",
    save: () => ({ ok: true }),
  });

  return (
    <div
      className="documents-empty-create"
      data-content-detail
      data-content-view-mode={mode}
    >
      <ContentDetailIconTitleHeader
        icon={
          <span className="documents-empty-create__icon" aria-hidden="true">
            <DocumentIcon size={16} />
          </span>
        }
        title={
          <h1 className={CONTENT_DETAIL_TITLE_CLASS}>
            <input
              type="text"
              className="documents-empty-create__title-input"
              value={title}
              disabled={creating}
              placeholder="Document title"
              aria-label="Document title"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  activateEditMode();
                }
              }}
            />
          </h1>
        }
      />

      <ContentMarkdownViewLayout
        mode={mode}
        editorActivated={editorActivated}
        onToggleMode={toggleViewMode}
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
              <p className="documents-empty-create__hint">
                This document is empty.
              </p>
            )}
          </ContentMarkdownPreviewColumn>
        }
        toggle={
          <FloatingPillToggleDock>
            <div className="documents-empty-create__dock">
              <button
                type="button"
                className="documents-empty-create__submit"
                disabled={creating}
                onClick={() => {
                  void onCreate({
                    title: title.trim() || "Untitled",
                    content: markdown,
                  });
                }}
              >
                {creating ? "Creating…" : "Create document"}
              </button>
              <SegmentedPillToggle
                value={mode}
                options={[
                  { value: "preview", label: "Preview" },
                  { value: "edit", label: "Edit" },
                ]}
                onChange={setViewMode}
                ariaLabel="Document view mode"
              />
            </div>
          </FloatingPillToggleDock>
        }
      />
    </div>
  );
}
