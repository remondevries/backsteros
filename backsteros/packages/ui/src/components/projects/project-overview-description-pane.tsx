"use client";

import {
  ContentMarkdownPreviewBody,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "../content/content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "../content/content-detail-title-header.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { ProjectOverviewIcon } from "./project-overview-icon.js";

export type ProjectOverviewDescriptionPaneProps = {
  name: string;
  icon?: string | null;
  type?: string | null;
  description: string | null | undefined;
  /** Empty-state copy under the icon (codebase Overview uses README.md). */
  emptyHint?: string;
  /** When false, ⌘E / view-mode shortcuts stay off (other panes own focus). */
  shortcutsEnabled?: boolean;
  onIconChange?: (icon: string | null) => void | Promise<void>;
  onSaveDescription?: (description: string) => void | Promise<void>;
};

/**
 * Codebase Overview tab — icon + README markdown (name lives in the left panel).
 * Callers for `type === "codebase"` should pass root README.md as `description`.
 */
export function ProjectOverviewDescriptionPane({
  name,
  icon,
  type,
  description,
  emptyHint = "Add a project description…",
  shortcutsEnabled = true,
  onIconChange,
  onSaveDescription,
}: ProjectOverviewDescriptionPaneProps) {
  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    handleChange,
    handleBlurSave,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: description ?? "",
    shortcutsEnabled,
    save: (next) => {
      if (!onSaveDescription) {
        return { ok: true };
      }
      return Promise.resolve(onSaveDescription(next)).then(() => ({
        ok: true as const,
      }));
    },
  });

  const iconOnly = (
    <ProjectOverviewIcon
      icon={icon}
      type={type}
      name={name}
      size={16}
      onIconChange={onIconChange}
    />
  );

  const editHeader = (
    <ContentDetailTitleHeader>
      <div className="content-detail-icon-title content-detail-icon-title--icon-only">
        {iconOnly}
      </div>
    </ContentDetailTitleHeader>
  );

  const previewTitleHeader = (
    <ContentDetailTitleHeader inlinePadding={false}>
      <div className="content-detail-icon-title content-detail-icon-title--icon-only">
        {iconOnly}
      </div>
    </ContentDetailTitleHeader>
  );

  return (
    <div
      className="codebase-project-workbench__overview markdown-document-embedded markdown-document-embedded--document-scroll"
      data-content-view-mode={mode}
    >
      <div className="markdown-document-scrollport">
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
              ariaLabel="Project description"
              scrollWithContent
            />
          }
          preview={
            <ContentMarkdownPreviewBody titleHeader={previewTitleHeader}>
              {value.trim() ? (
                <DocumentMarkdownPreview
                  body={value}
                  onChange={handleChange}
                />
              ) : (
                <p className="content-markdown-empty-hint">{emptyHint}</p>
              )}
            </ContentMarkdownPreviewBody>
          }
        />
        {error ? (
          <p className="project-detail__description-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <FloatingPillToggleDock>
        <SegmentedPillToggle
          value={mode}
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
          onChange={setViewMode}
          ariaLabel="Project description view mode"
        />
      </FloatingPillToggleDock>
    </div>
  );
}
