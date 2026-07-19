"use client";

import { useState, type ReactNode } from "react";

import {
  TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS,
  TASK_PROPERTIES_PANEL_WIDTH_KEY,
} from "../properties-panel.js";
import { useContentTitleEditorNavigation } from "../use-content-title-editor-navigation.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "./content-detail-title-header.js";
import { DetailWithPropertiesLayout } from "./detail-with-properties-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import {
  TaskPropertiesDisplay,
  type TaskPropertiesDisplayTask,
} from "./task-properties-display.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";

export type TaskDetailViewTask = TaskPropertiesDisplayTask & {
  title: string;
  description?: string | null;
  displayId?: string | null;
};

export type TaskDetailViewProps = {
  task: TaskDetailViewTask;
  sectionLabel?: string;
  headerMeta?: ReactNode;
  onSaveDescription?: (value: string) => void | Promise<void>;
  onSaveTitle?: (
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onFieldActivate?: (field: string) => void;
  onStatusChange?: (
    status: import("../task-status.js").TaskStatus,
  ) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateAssigneeFromQuery?: (query: string) => void;
};

export function TaskDetailView({
  task,
  sectionLabel = "Tasks",
  headerMeta,
  onSaveDescription,
  onSaveTitle,
  onFieldActivate,
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  assigneeOptions,
  projectOptions,
  assigneeNavigateHref,
  projectNavigateHref,
  onCreateAssigneeFromQuery,
}: TaskDetailViewProps) {
  const [title, setTitle] = useState(task.title);
  const [titleSource, setTitleSource] = useState(task.title);
  const [prevTaskId, setPrevTaskId] = useState(task.id);
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id);
    setTitle(task.title);
    setTitleSource(task.title);
  } else if (task.title !== titleSource) {
    // Remote/synced title changed — adopt it when the local field is clean.
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
        console.info("[task-detail] save description", next.slice(0, 80));
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

  const titleEditor = (
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
  );

  void sectionLabel;
  void headerMeta;

  return (
    <div
      className="task-detail-split"
      data-content-detail
      data-detail-split=""
      data-content-view-mode={mode}
    >
    <DetailWithPropertiesLayout
      storageKey={TASK_PROPERTIES_PANEL_WIDTH_KEY}
      legacyStorageKeys={TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS}
      main={
        <div className="inbox-detail-layout">
          <div className="inbox-detail-body inbox-detail-body--document">
            <ContentDetailTitleHeader>
              {task.displayId ? (
                <p className="content-detail-display-id">{task.displayId}</p>
              ) : null}
              {titleEditor}
            </ContentDetailTitleHeader>
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
                  ariaLabel="Task description"
                />
              }
              preview={
                <ContentMarkdownPreviewColumn includeTopInset={false}>
                  {value.trim() ? (
                    <DocumentMarkdownPreview body={value} />
                  ) : (
                    <p className="overview-empty">Add a description…</p>
                  )}
                </ContentMarkdownPreviewColumn>
              }
            />
            {error ? (
              <p className="overview-empty" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      }
      properties={
        <TaskPropertiesDisplay
          task={task}
          onFieldActivate={onFieldActivate}
          onStatusChange={onStatusChange}
          onPriorityChange={onPriorityChange}
          onDueDateChange={onDueDateChange}
          onAssigneeChange={onAssigneeChange}
          onProjectChange={onProjectChange}
          assigneeOptions={assigneeOptions}
          projectOptions={projectOptions}
          assigneeNavigateHref={assigneeNavigateHref}
          projectNavigateHref={projectNavigateHref}
          onCreateAssigneeFromQuery={onCreateAssigneeFromQuery}
        />
      }
      dock={<FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>}
    />
    </div>
  );
}
