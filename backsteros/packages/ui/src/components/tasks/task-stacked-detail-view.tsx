"use client";

import type { TaskLink } from "@backsteros/contracts";
import { trackedMinutesFromTaskSchedule } from "@backsteros/contracts";
import { useState, type ReactNode } from "react";

import { useContentTitleEditorNavigation } from "../../content/use-content-title-editor-navigation.js";
import { ContentMarkdownDescriptionLayout } from "../content/content-markdown-description-layout.js";
import { useMarkdownDetailEditor } from "../content/content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "../content/content-detail-title-header.js";
import {
  type ResolveMarkdownImageSrc,
} from "../documents/document-markdown-preview.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { TrackedTimeField } from "../shared/tracked-time-field.js";
import type { TrackedTimerSessionMeta } from "../../tracked-timer/tracked-timer-context.js";
import {
  TaskPropertiesInlineChips,
} from "./task-properties-inline-chips.js";
import { SupportContactCard } from "./support-contact-card.js";
import { SupportOrganizationCard } from "./support-organization-card.js";
import type { TaskDetailViewTask } from "./task-detail-view.js";
import {
  TaskLinkAttachments,
  type TaskFileAttachmentItem,
} from "./task-link-attachments.js";
import type { UploadMarkdownImages } from "../../documents/markdown-image-paste.js";
import type { TaskRelatedSelection } from "../../tasks/task-related-entities.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import type { SupportContactCardModel, SupportOrganizationCardModel } from "./support-party-card-types.js";

function toDate(value: number | Date | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

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
  fileAttachments?: readonly TaskFileAttachmentItem[];
  fileUploading?: boolean;
  onUploadFile?: (file: File) => void | Promise<void>;
  onRemoveFile?: (attachmentId: string) => void;
  onOpenFile?: (attachmentId: string) => void;
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
    status: TaskStatus,
  ) => void;
  statusDisabled?: boolean;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onRelatedChange?: (related: TaskRelatedSelection) => void;
  onProjectChange?: (projectKey: string | null) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  relatedOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onCreateAssigneeFromQuery?: (query: string) => void;
  onCreateRelatedContactFromQuery?: (query: string) => void;
  supportContact?: SupportContactCardModel | null;
  supportOrganization?: SupportOrganizationCardModel | null;
  supportContactHref?: string | null;
  supportOrganizationHref?: string | null;
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  onTimerSessionChange?: (
    action: "start" | "pause",
    seconds?: number | null,
  ) => void;
  timerSession?: TrackedTimerSessionMeta | null;
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
  fileAttachments,
  fileUploading,
  onUploadFile,
  onRemoveFile,
  onOpenFile,
  onUploadImages,
  resolveImageSrc,
  onSaveTitle,
  onFieldActivate,
  onStatusChange,
  statusDisabled = false,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onRelatedChange,
  onProjectChange,
  assigneeOptions,
  relatedOptions,
  projectOptions,
  onCreateAssigneeFromQuery,
  onCreateRelatedContactFromQuery,
  supportContact = null,
  supportOrganization = null,
  supportContactHref = null,
  supportOrganizationHref = null,
  onTrackedDurationSecondsChange,
  onTimerSessionChange,
  timerSession = null,
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
          {(showDisplayId && task.displayId) || !task.support ? (
            <div className="content-detail-display-id-row">
              {showDisplayId && task.displayId ? (
                <p className="content-detail-display-id">{task.displayId}</p>
              ) : (
                <span />
              )}
              {task.support ? null : (
                <div className="content-detail-display-id-row__timer">
                  <TrackedTimeField
                    variant="pill"
                    trackedDurationSeconds={task.trackedDurationSeconds ?? null}
                    trackedMinutes={task.trackedMinutes ?? null}
                    scheduleMinutes={trackedMinutesFromTaskSchedule(
                      toDate(task.dueDate),
                      toDate(task.dueEndDate),
                    )}
                    onTrackedDurationSecondsChange={
                      onTrackedDurationSecondsChange
                    }
                    onTimerSessionChange={onTimerSessionChange}
                    timerSession={timerSession}
                  />
                </div>
              )}
            </div>
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
          {task.support ? (
            <div className="task-detail-stacked__support-parties">
              <SupportContactCard
                contact={supportContact}
                viewHref={supportContactHref}
              />
              <SupportOrganizationCard
                organization={supportOrganization}
                viewHref={supportOrganizationHref}
              />
            </div>
          ) : null}
          <TaskPropertiesInlineChips
            task={task}
            onFieldActivate={onFieldActivate}
            onStatusChange={onStatusChange}
            statusDisabled={statusDisabled}
            onPriorityChange={onPriorityChange}
            onDueDateChange={onDueDateChange}
            onAssigneeChange={onAssigneeChange}
            onRelatedChange={onRelatedChange}
            onProjectChange={onProjectChange}
            assigneeOptions={assigneeOptions}
            relatedOptions={relatedOptions}
            projectOptions={projectOptions}
            onCreateAssigneeFromQuery={onCreateAssigneeFromQuery}
            onCreateRelatedContactFromQuery={onCreateRelatedContactFromQuery}
          />
        </div>
        <div className="task-detail-stacked__content">
          <ContentMarkdownDescriptionLayout
            mode={mode}
            editorActivated={editorActivated}
            onToggleMode={toggleViewMode}
            value={value}
            onChange={handleChange}
            onBlur={handleBlurSave}
            focusRequest={editorFocusRequest}
            onUploadImages={onUploadImages}
            resolveImageSrc={resolveImageSrc}
            ariaLabel="Task description"
            emptyMessage="Add a description…"
          />
          <div className="task-detail-tools-column">
            <div className="task-detail-description-tools">
              <div className="task-detail-description-tools__attachments">
                <TaskLinkAttachments
                  links={task.links}
                  onChangeLinks={onChangeLinks}
                  fileAttachments={fileAttachments}
                  fileUploading={fileUploading}
                  onUploadFile={onUploadFile}
                  onRemoveFile={onRemoveFile}
                  onOpenFile={onOpenFile}
                />
              </div>
              <div className="task-detail-description-tools__view-mode">
                {viewModeToggle}
              </div>
            </div>
          </div>
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
