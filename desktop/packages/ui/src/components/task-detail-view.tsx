"use client";

import type { TaskLink } from "@backsteros/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS,
  TASK_PROPERTIES_PANEL_WIDTH_KEY,
} from "../properties-panel.js";
import { isAgentInboxPending } from "../inbox-items.js";
import {
  spellcheckHasChanges,
  spellcheckMarkRanges,
  type SpellcheckSegment,
} from "../text-diff-ranges.js";
import { useContentTitleEditorNavigation } from "../use-content-title-editor-navigation.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
  type MarkdownDetailEditorMode,
} from "./content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "./content-detail-title-header.js";
import { DetailWithPropertiesLayout } from "./detail-with-properties-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import {
  DocumentMarkdownPreview,
  type ResolveMarkdownImageSrc,
} from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import { SpellcheckSegmentText } from "./spellcheck-segment-text.js";
import {
  TaskPropertiesDisplay,
  type TaskPropertiesDisplayTask,
} from "./task-properties-display.js";
import { TaskPropertiesInlineChips } from "./task-properties-inline-chips.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { TaskLinkAttachments } from "./task-link-attachments.js";
import type { UploadMarkdownImages } from "../markdown-image-paste.js";

/** Below this width, properties render as inline chips; at/above as the card rail. */
export const TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT = 720;

export type TaskDetailViewTask = TaskPropertiesDisplayTask & {
  title: string;
  description?: string | null;
  displayId?: string | null;
  links?: TaskLink[] | null;
};

export type TaskSpellcheckHighlight = {
  beforeTitle: string;
  beforeDescription: string;
  titleSegments: SpellcheckSegment[];
  descriptionSegments: SpellcheckSegment[];
  /** Bumps when a new spellcheck lands so effects re-run. */
  nonce: number;
};

export type TaskDetailBelowDescriptionContext = {
  mode: MarkdownDetailEditorMode;
};

export type TaskDetailViewProps = {
  task: TaskDetailViewTask;
  sectionLabel?: string;
  headerMeta?: ReactNode;
  /**
   * When true (default), show `task.displayId` above the title.
   * Set false when the host chrome already shows the id.
   */
  showDisplayId?: boolean;
  /**
   * Optional content rendered below the description (e.g. activity / comments).
   * Pass a render function to receive the current preview/edit mode.
   */
  belowDescription?:
    | ReactNode
    | ((ctx: TaskDetailBelowDescriptionContext) => ReactNode);
  /** When set, show interactive orange/grey spellcheck segments. */
  spellcheckHighlight?: TaskSpellcheckHighlight | null;
  onSpellcheckHighlightClear?: () => void;
  onToggleSpellcheckTitleSegment?: (segmentId: string) => void;
  onToggleSpellcheckDescriptionSegment?: (segmentId: string) => void;
  onSaveDescription?: (value: string) => void | Promise<void>;
  onChangeLinks?: (links: TaskLink[]) => void;
  /** Upload clipboard/drop images for Linear-style markdown embeds. */
  onUploadImages?: UploadMarkdownImages;
  /** Resolve authenticated task image URLs in the preview. */
  resolveImageSrc?: ResolveMarkdownImageSrc;
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
  /** When true, status dropdown is read-only (inbox triage without a project). */
  statusDisabled?: boolean;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateAssigneeFromQuery?: (query: string) => void;
  /** Sign-off for agent-created tasks — removes from Agents inbox subgroup. */
  onAgentInboxApprove?: () => void;
};

export function TaskDetailView({
  task,
  sectionLabel = "Tasks",
  headerMeta,
  showDisplayId = true,
  belowDescription,
  spellcheckHighlight = null,
  onSpellcheckHighlightClear,
  onToggleSpellcheckTitleSegment,
  onToggleSpellcheckDescriptionSegment,
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
  assigneeNavigateHref,
  projectNavigateHref,
  onCreateAssigneeFromQuery,
  onAgentInboxApprove,
}: TaskDetailViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [usePropertiesRail, setUsePropertiesRail] = useState(false);
  const agentInboxPending = isAgentInboxPending(task);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let settledTimer: number | null = null;
    let didCommitInitial = false;
    const commit = (width: number) => {
      setUsePropertiesRail(width >= TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT);
    };
    const update = () => {
      const width = Math.round(node.getBoundingClientRect().width);
      // First paint: apply immediately. Later: wait until width stops changing
      // so a smooth split nudge cannot flip chips ↔ rail mid-animation.
      if (!didCommitInitial) {
        didCommitInitial = true;
        commit(width);
        return;
      }
      if (settledTimer != null) window.clearTimeout(settledTimer);
      settledTimer = window.setTimeout(() => {
        settledTimer = null;
        commit(width);
      }, 140);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      if (settledTimer != null) window.clearTimeout(settledTimer);
      observer.disconnect();
    };
  }, []);

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

  const titleSegments = spellcheckHighlight?.titleSegments ?? [];
  const descriptionSegments = spellcheckHighlight?.descriptionSegments ?? [];
  const hasSpellcheckHighlights =
    spellcheckHasChanges(titleSegments) ||
    spellcheckHasChanges(descriptionSegments);

  const descriptionMarkRanges = useMemo(
    () => spellcheckMarkRanges(descriptionSegments),
    [descriptionSegments],
  );

  const clearHighlights = () => {
    if (spellcheckHighlight) onSpellcheckHighlightClear?.();
  };

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

  const handleToggleViewMode = () => {
    clearHighlights();
    toggleViewMode();
  };

  const viewModeToggle = (
    <SegmentedPillToggle
      value={mode}
      options={[
        { value: "preview", label: "Preview" },
        { value: "edit", label: "Edit" },
      ]}
      onChange={(next) => {
        if (next === "edit") clearHighlights();
        setViewMode(next);
      }}
      ariaLabel="Content view mode"
    />
  );

  const titleEditor = (
    <OverviewNameEditor
      value={title}
      entityLabel="Task"
      resetKey={task.id}
      renameFocusRequest={titleRenameFocusRequest}
      highlightContent={
        hasSpellcheckHighlights && spellcheckHasChanges(titleSegments) ? (
          <SpellcheckSegmentText
            segments={titleSegments}
            onToggleSegment={onToggleSpellcheckTitleSegment}
          />
        ) : undefined
      }
      onBeginEdit={clearHighlights}
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

  const displayIdNode =
    showDisplayId && task.displayId ? (
      <p className="content-detail-display-id">{task.displayId}</p>
    ) : null;

  const descriptionEditor = (
    <DocumentMarkdownEditor
      value={value}
      onChange={(next) => {
        clearHighlights();
        handleChange(next);
      }}
      onBlur={handleBlurSave}
      focusRequest={editorFocusRequest}
      scrollWithContent
      highlightRanges={descriptionMarkRanges}
      onUploadImages={onUploadImages}
      ariaLabel="Task description"
    />
  );

  const descriptionPreview = (
    <ContentMarkdownPreviewColumn includeTopInset={false}>
      {hasSpellcheckHighlights &&
      spellcheckHasChanges(descriptionSegments) ? (
        <div
          className="spellcheck-highlight-description"
          aria-label="Spellchecked description"
        >
          <SpellcheckSegmentText
            segments={descriptionSegments}
            onToggleSegment={onToggleSpellcheckDescriptionSegment}
          />
        </div>
      ) : value.trim() ? (
        <DocumentMarkdownPreview
          body={value}
          onChange={handleChange}
          resolveImageSrc={resolveImageSrc}
        />
      ) : (
        <p className="overview-empty">Add a description…</p>
      )}
    </ContentMarkdownPreviewColumn>
  );

  const belowDescriptionNode = belowDescription ? (
    <div className="task-detail-below-description">
      {typeof belowDescription === "function"
        ? belowDescription({ mode })
        : belowDescription}
    </div>
  ) : null;

  const errorNode = error ? (
    <p className="overview-empty" role="alert">
      {error}
    </p>
  ) : null;

  void sectionLabel;

  const stackedBody = (
    <>
      {headerMeta ? (
        <div className="inbox-detail-header-meta">{headerMeta}</div>
      ) : null}
      <div className="task-detail-stacked__scroll">
        <ContentDetailTitleHeader>
          {displayIdNode}
          {titleEditor}
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
            onToggleMode={handleToggleViewMode}
            editor={descriptionEditor}
            preview={descriptionPreview}
            toggle={
              <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
            }
          />
          <TaskLinkAttachments
            links={task.links}
            onChangeLinks={onChangeLinks}
          />
          {belowDescriptionNode}
          {errorNode}
        </div>
      </div>
    </>
  );

  const railBody = (
    <DetailWithPropertiesLayout
      storageKey={TASK_PROPERTIES_PANEL_WIDTH_KEY}
      legacyStorageKeys={TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS}
      main={
        <div className="inbox-detail-layout">
          {headerMeta ? (
            <div className="inbox-detail-header-meta">{headerMeta}</div>
          ) : null}
          <div className="inbox-detail-body inbox-detail-body--document">
            <ContentDetailTitleHeader>
              {displayIdNode}
              {titleEditor}
            </ContentDetailTitleHeader>
            <ContentMarkdownViewLayout
              mode={mode}
              editorActivated={editorActivated}
              onToggleMode={handleToggleViewMode}
              editor={descriptionEditor}
              preview={descriptionPreview}
            />
            <TaskLinkAttachments
              links={task.links}
              onChangeLinks={onChangeLinks}
            />
            {belowDescriptionNode}
            {errorNode}
          </div>
        </div>
      }
      properties={
        <TaskPropertiesDisplay
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
          assigneeNavigateHref={assigneeNavigateHref}
          projectNavigateHref={projectNavigateHref}
          onCreateAssigneeFromQuery={onCreateAssigneeFromQuery}
          agentInboxPending={agentInboxPending}
          onAgentInboxApprove={onAgentInboxApprove}
        />
      }
      dock={<FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>}
    />
  );

  return (
    <div
      ref={rootRef}
      className={[
        "task-detail-view",
        usePropertiesRail ? "task-detail-split" : "task-detail-stacked",
      ].join(" ")}
      data-content-detail
      data-detail-split={usePropertiesRail ? "" : undefined}
      data-content-view-mode={mode}
      data-properties-presentation={usePropertiesRail ? "rail" : "chips"}
    >
      {usePropertiesRail ? railBody : stackedBody}
    </div>
  );
}
