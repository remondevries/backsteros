"use client";

import type { ReactNode } from "react";

import type { UploadMarkdownImages } from "../../documents/markdown-image-paste.js";
import {
  DocumentMarkdownEditor,
  type DocumentMarkdownEditorProps,
} from "../documents/document-markdown-editor.js";
import {
  DocumentMarkdownPreview,
  type ResolveMarkdownImageSrc,
} from "../documents/document-markdown-preview.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  type ContentMarkdownViewMode,
} from "./content-markdown-view-layout.js";

export type ContentMarkdownDescriptionLayoutProps = {
  mode: ContentMarkdownViewMode;
  editorActivated: boolean;
  onToggleMode?: () => void;
  /** Optional Edit/Preview dock (positioned inside the layout). */
  toggle?: ReactNode;
  editHeader?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  focusRequest?: number;
  ariaLabel: string;
  /** Shown when preview is empty. Defaults to a generic hint. */
  emptyMessage?: string;
  /** Class for the empty-message paragraph. */
  emptyClassName?: string;
  /**
   * Size the editor to its content (task / letter / meeting notes).
   * Default true — matches description fields.
   */
  scrollWithContent?: boolean;
  disabled?: boolean;
  highlightRanges?: DocumentMarkdownEditorProps["highlightRanges"];
  onUploadImages?: UploadMarkdownImages;
  resolveImageSrc?: ResolveMarkdownImageSrc;
  /**
   * Replace the default markdown preview (e.g. spellcheck segment view).
   * When set, `emptyMessage` / `resolveImageSrc` are ignored.
   */
  preview?: ReactNode;
};

/**
 * Shared edit/preview markdown description field used by tasks, letters,
 * meetings, etc. Always mounts {@link DocumentMarkdownEditor} so caret,
 * list-bullet, and theme cleanup stay in one place.
 */
export function ContentMarkdownDescriptionLayout({
  mode,
  editorActivated,
  onToggleMode,
  toggle,
  editHeader,
  value,
  onChange,
  onBlur,
  focusRequest,
  ariaLabel,
  emptyMessage = "Add a description…",
  emptyClassName = "overview-empty",
  scrollWithContent = true,
  disabled,
  highlightRanges,
  onUploadImages,
  resolveImageSrc,
  preview: previewOverride,
}: ContentMarkdownDescriptionLayoutProps) {
  const editor = (
    <DocumentMarkdownEditor
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      focusRequest={focusRequest}
      scrollWithContent={scrollWithContent}
      highlightRanges={highlightRanges}
      onUploadImages={onUploadImages}
      disabled={disabled}
      ariaLabel={ariaLabel}
    />
  );

  const preview =
    previewOverride ?? (
      <ContentMarkdownPreviewColumn includeTopInset={false}>
        {value.trim() ? (
          <DocumentMarkdownPreview
            body={value}
            onChange={onChange}
            resolveImageSrc={resolveImageSrc}
          />
        ) : (
          <p className={emptyClassName}>{emptyMessage}</p>
        )}
      </ContentMarkdownPreviewColumn>
    );

  return (
    <ContentMarkdownViewLayout
      mode={mode}
      editorActivated={editorActivated}
      onToggleMode={onToggleMode}
      editHeader={editHeader}
      editor={editor}
      preview={preview}
      toggle={toggle}
    />
  );
}
