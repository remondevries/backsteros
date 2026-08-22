"use client";

import type { TaskLink } from "@backsteros/contracts";
import { useState, type ReactNode } from "react";

import { useContentTitleEditorNavigation } from "../../content/use-content-title-editor-navigation.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "../content/content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "../content/content-detail-title-header.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import {
  DocumentMarkdownPreview,
  type ResolveMarkdownImageSrc,
} from "../documents/document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  TaskPropertiesInlineChips,
} from "./task-properties-inline-chips.js";
import type { TaskDetailViewTask } from "./task-detail-view.js";
import { TaskLinkAttachments } from "./task-link-attachments.js";
import type { UploadMarkdownImages } from "../../documents/markdown-image-paste.js";

export type TaskStackedDetailViewProps = {
  task: TaskDetailViewTask;
  /**
   * When true (default), show `task.displayId` above the title.
   * Set false when the host chrome already shows the id (e.g. console pane header).
   */
  showDisplayId?: boolean;
  /**
   * Optional content rendered below the description (e.g. agent session rows).
   */
  belowDescription?: ReactNode;
  onSaveDescription?: (value: string) => void | Promise<void>;
  onChangeLinks?: (links: TaskLink[]) => void;
  onUploadImages?: UploadMarkdownImages;
  resolveImageSrc?: ResolveMarkdownImageSrc;
  onSaveTitle?: (
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onFieldActivate?: (field: string) => void;
  onStatusChange?: (
    status: import("../../tasks/task-status.js").TaskStatus,
  ) => void;
  statusDisabled?: boolean;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onCreateAssigneeFromQuery?: (query: string) => void;
};

/**
 * Narrow-host task detail: title → inline property chips → markdown content.
 * Prefer `TaskDetailView`, which switches chips/rail by measured width.
 * Kept for legacy console hosts that always want the stacked presentation.
 */
export function TaskStackedDetailView({
  task,
  showDisplayId = true,
  belowDescription,
  onSaveDescription,
  onChangeLinks,
  onUploadImages,
  resolveImageSrc,
  onSaveTitle,
  onFieldActivate,
  onStatusChange,
  statusDisabled = false,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  assigneeOptions,
  projectOptions,
  onCreateAssigneeFromQuery,
}: TaskStackedDetailViewProps) {
  const [title, setTitle] = useState(task.title);
  const [titleSource, setTitleSource] = useState(task.title);
  const [prevTaskId, setPrevTaskId] = useState(task.id);
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id);
    setTitle(task.title);
    setTitleSource(task.title);
  } else if (task.title !== titleSource) {
    setTitleSource(task.title);
    if (title === titleSource) {
      setTitle(task.title);
    }
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
    initialValue: task.description ?? "",
    save: (next) => {
      if (!onSaveDescription) {
        return { ok: true };
      }
      return Promise.resolve(onSaveDescription(next)).then(() => ({ ok: true }));
    },
  });

  const {
    titleRenameFocusRequest,
    handleLeaveTitleForEditor,
  } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const viewModeToggle = (
    <SegmentedPillToggle
      value={mode}
      options={[
        { value: "preview", label: "Preview" },
        { value: "edit", label: "Edit" },
      ]}
      onChange={setViewMode}
      ariaLabel="Content view mode"
    />
  );

  return (
    <div
      className="task-detail-stacked"
      data-content-detail
      data-content-view-mode={mode}
    >
      <div className="task-detail-stacked__scroll">
        <ContentDetailTitleHeader>
          {showDisplayId && task.displayId ? (
            <p className="content-detail-display-id">{task.displayId}</p>
          ) : null}
          <OverviewNameEditor
            value={title}
            entityLabel="Task"
            resetKey={task.id}
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
        </ContentDetailTitleHeader>
        <div className="task-detail-stacked__properties">
          <TaskPropertiesInlineChips
            task={task}
            onFieldActivate={onFieldActivate}
            onStatusChange={onStatusChange}
            statusDisabled={statusDisabled}
            onPriorityChange={onPriorityChange}
            onDueDateChange={onDueDateChange}
            onAssigneeChange={onAssigneeChange}
            onProjectChange={onProjectChange}
            assigneeOptions={assigneeOptions}
            projectOptions={projectOptions}
            onCreateAssigneeFromQuery={onCreateAssigneeFromQuery}
          />
        </div>
        <div className="task-detail-stacked__content">
          <ContentMarkdownViewLayout
            mode={mode}
            editorActivated={editorActivated}
            onToggleMode={toggleViewMode}
            editor={
              <DocumentMarkdownEditor
                value={value}
                onChange={handleChange}
                onBlur={handleBlurSave}
                focusRequest={editorFocusRequest}
                scrollWithContent
                onUploadImages={onUploadImages}
                ariaLabel="Task description"
              />
            }
            preview={
              <ContentMarkdownPreviewColumn includeTopInset={false}>
                {value.trim() ? (
                  <DocumentMarkdownPreview
                    body={value}
                    onChange={handleChange}
                    resolveImageSrc={resolveImageSrc}
                  />
                ) : (
                  <p className="overview-empty">Add a description…</p>
                )}
              </ContentMarkdownPreviewColumn>
            }
            toggle={
              <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
            }
          />
          <TaskLinkAttachments
            links={task.links}
            onChangeLinks={onChangeLinks}
          />
          {belowDescription ? (
            <div className="task-detail-below-description">
              {belowDescription}
            </div>
          ) : null}
          {error ? (
            <p className="overview-empty" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
