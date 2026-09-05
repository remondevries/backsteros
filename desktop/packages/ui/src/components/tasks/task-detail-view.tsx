"use client";

import type { TaskLink } from "@backsteros/contracts";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS,
  TASK_PROPERTIES_PANEL_WIDTH_KEY,
} from "../../content/properties-panel.js";
import { isAgentInboxPending } from "../../inbox/inbox-items.js";
import {
  spellcheckHasChanges,
  spellcheckMarkRanges,
  type SpellcheckSegment,
} from "../../shared/text-diff-ranges.js";
import { useContentTitleEditorNavigation } from "../../content/use-content-title-editor-navigation.js";
import { ContentMarkdownDescriptionLayout } from "../content/content-markdown-description-layout.js";
import {
  ContentMarkdownPreviewColumn,
  useMarkdownDetailEditor,
  type MarkdownDetailEditorMode,
} from "../content/content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "../content/content-detail-title-header.js";
import { ResizableSidePanel } from "../shell/resizable-side-panel.js";
import { type ResolveMarkdownImageSrc } from "../documents/document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import { SpellcheckSegmentText } from "../shared/spellcheck-segment-text.js";
import { useContentLayoutTransition } from "../shell/content-layout-transition-context.js";
import {
  TaskPropertiesDisplay,
  type TaskPropertiesDisplayTask,
} from "./task-properties-display.js";
import type { TrackedTimerSessionMeta } from "../../tracked-timer/tracked-timer-context.js";
import { TaskPropertiesInlineChips } from "./task-properties-inline-chips.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  TaskLinkAttachments,
  type TaskFileAttachmentItem,
  type TaskLinkPickerOption,
} from "./task-link-attachments.js";
import type { UploadMarkdownImages } from "../../documents/markdown-image-paste.js";

/** Below this width, properties render as inline chips; at/above as the card rail. */
export const TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT = 720;

function clearTaskDetailWidthLock(node: HTMLElement) {
  node.style.width = "";
  node.style.maxWidth = "";
  node.style.minWidth = "";
}

function lockTaskDetailWidth(node: HTMLElement) {
  const width = Math.round(node.getBoundingClientRect().width);
  node.style.boxSizing = "border-box";
  node.style.width = `${width}px`;
  node.style.maxWidth = `${width}px`;
  node.style.minWidth = `${width}px`;
  return width;
}

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
  /** Optional content below attachments (e.g. linked commit Changes). */
  afterAttachments?: ReactNode;
  /** When set, show interactive orange/grey spellcheck segments. */
  spellcheckHighlight?: TaskSpellcheckHighlight | null;
  onSpellcheckHighlightClear?: () => void;
  onToggleSpellcheckTitleSegment?: (segmentId: string) => void;
  onToggleSpellcheckDescriptionSegment?: (segmentId: string) => void;
  onSaveDescription?: (value: string) => void | Promise<void>;
  onChangeLinks?: (links: TaskLink[]) => void;
  fileAttachments?: readonly TaskFileAttachmentItem[];
  fileUploading?: boolean;
  onUploadFile?: (file: File) => void | Promise<void>;
  onRemoveFile?: (attachmentId: string) => void;
  onOpenFile?: (attachmentId: string) => void;
  documentLinkOptions?: readonly TaskLinkPickerOption[];
  letterLinkOptions?: readonly TaskLinkPickerOption[];
  emailLinkOptions?: readonly TaskLinkPickerOption[];
  onNavigateLink?: (href: string) => void;
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
    status: import("../../tasks/task-status.js").TaskStatus,
  ) => void;
  /** When true, status dropdown is read-only (inbox triage without a project). */
  statusDisabled?: boolean;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onRelatedChange?: (related: import("../../tasks/task-related-entities.js").TaskRelatedSelection) => void;
  onProjectChange?: (projectKey: string | null) => void;
  assigneeOptions?: SearchableDropdownOption<string>[];
  relatedOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  assigneeNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateAssigneeFromQuery?: (query: string) => void;
  onCreateRelatedContactFromQuery?: (query: string) => void;
  /** Sign-off for agent-created tasks — removes from Agents inbox subgroup. */
  onAgentInboxApprove?: () => void;
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  onTimerSessionChange?: (
    action: "start" | "pause",
    seconds?: number | null,
  ) => void;
  timerSession?: TrackedTimerSessionMeta | null;
};

export function TaskDetailView({
  task,
  sectionLabel = "Tasks",
  headerMeta,
  showDisplayId = true,
  belowDescription,
  afterAttachments,
  spellcheckHighlight = null,
  onSpellcheckHighlightClear,
  onToggleSpellcheckTitleSegment,
  onToggleSpellcheckDescriptionSegment,
  onSaveDescription,
  onChangeLinks,
  fileAttachments,
  fileUploading,
  onUploadFile,
  onRemoveFile,
  onOpenFile,
  documentLinkOptions,
  letterLinkOptions,
  emailLinkOptions,
  onNavigateLink,
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
  assigneeNavigateHref,
  projectNavigateHref,
  onCreateAssigneeFromQuery,
  onCreateRelatedContactFromQuery,
  onAgentInboxApprove,
  onTrackedDurationSecondsChange,
  onTimerSessionChange,
  timerSession = null,
}: TaskDetailViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [usePropertiesRail, setUsePropertiesRail] = useState(false);
  const { animating: layoutAnimating } = useContentLayoutTransition();
  const layoutAnimatingRef = useRef(layoutAnimating);
  layoutAnimatingRef.current = layoutAnimating;
  const widthLockedRef = useRef(false);
  const agentInboxPending = isAgentInboxPending(task);

  // Freeze pixel width the moment chrome/agent panels start interpolating so
  // chips ↔ rail cannot flip while available space is mid-slide.
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    if (layoutAnimating) {
      if (!widthLockedRef.current) {
        lockTaskDetailWidth(node);
        widthLockedRef.current = true;
      }
      return;
    }
    if (widthLockedRef.current) {
      clearTaskDetailWidthLock(node);
      widthLockedRef.current = false;
    }
  }, [layoutAnimating]);

  // After unlock (or when not animating), commit presentation from real width.
  useEffect(() => {
    if (layoutAnimating) return;
    const node = rootRef.current;
    if (!node) return;
    const width = Math.round(node.getBoundingClientRect().width);
    setUsePropertiesRail(width >= TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT);
  }, [layoutAnimating]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let settledTimer: number | null = null;
    let didCommitInitial = false;
    const commit = (width: number) => {
      if (layoutAnimatingRef.current) return;
      setUsePropertiesRail(width >= TASK_DETAIL_PROPERTIES_RAIL_BREAKPOINT);
    };
    const update = () => {
      if (layoutAnimatingRef.current) return;
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

  const descriptionPreview =
    hasSpellcheckHighlights && spellcheckHasChanges(descriptionSegments) ? (
      <ContentMarkdownPreviewColumn includeTopInset={false}>
        <div
          className="spellcheck-highlight-description"
          aria-label="Spellchecked description"
        >
          <SpellcheckSegmentText
            segments={descriptionSegments}
            onToggleSegment={onToggleSpellcheckDescriptionSegment}
          />
        </div>
      </ContentMarkdownPreviewColumn>
    ) : undefined;

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

  const viewModeDock = (
    <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
  );

  void sectionLabel;

  // One persistent tree for chips ↔ rail so activity/comments keep their
  // instance (and feed) across the presentation flip. Unused layout wrappers
  // use `display: contents` so stacked CSS still sees the original hierarchy.
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
      data-width-locked={layoutAnimating ? "true" : undefined}
    >
      <div
        className={usePropertiesRail ? "detail-with-properties" : undefined}
        style={usePropertiesRail ? undefined : { display: "contents" }}
      >
        <div
          className={
            usePropertiesRail
              ? "detail-with-properties__main"
              : "task-detail-stacked__scroll"
          }
        >
          {headerMeta ? (
            <div className="inbox-detail-header-meta">{headerMeta}</div>
          ) : null}
          <div
            className={usePropertiesRail ? "inbox-detail-layout" : undefined}
            style={usePropertiesRail ? undefined : { display: "contents" }}
          >
            <div
              className={
                usePropertiesRail
                  ? "inbox-detail-body inbox-detail-body--document"
                  : undefined
              }
              style={usePropertiesRail ? undefined : { display: "contents" }}
            >
              <ContentDetailTitleHeader>
                {displayIdNode}
                {titleEditor}
              </ContentDetailTitleHeader>
              {!usePropertiesRail ? (
                <div className="task-detail-stacked__properties">
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
                    onCreateRelatedContactFromQuery={
                      onCreateRelatedContactFromQuery
                    }
                    onTrackedDurationSecondsChange={
                      onTrackedDurationSecondsChange
                    }
                    onTimerSessionChange={onTimerSessionChange}
                    timerSession={timerSession}
                  />
                </div>
              ) : null}
              <div
                className={
                  usePropertiesRail ? undefined : "task-detail-stacked__content"
                }
                style={usePropertiesRail ? { display: "contents" } : undefined}
              >
                <ContentMarkdownDescriptionLayout
                  mode={mode}
                  editorActivated={editorActivated}
                  onToggleMode={handleToggleViewMode}
                  value={value}
                  onChange={(next) => {
                    clearHighlights();
                    handleChange(next);
                  }}
                  onBlur={handleBlurSave}
                  focusRequest={editorFocusRequest}
                  highlightRanges={descriptionMarkRanges}
                  onUploadImages={onUploadImages}
                  resolveImageSrc={resolveImageSrc}
                  ariaLabel="Task description"
                  emptyMessage="Add a description…"
                  preview={descriptionPreview}
                  toggle={usePropertiesRail ? undefined : viewModeDock}
                />
                <TaskLinkAttachments
                  links={task.links}
                  onChangeLinks={onChangeLinks}
                  documentOptions={documentLinkOptions}
                  letterOptions={letterLinkOptions}
                  emailOptions={emailLinkOptions}
                  onNavigate={onNavigateLink}
                  fileAttachments={fileAttachments}
                  fileUploading={fileUploading}
                  onUploadFile={onUploadFile}
                  onRemoveFile={onRemoveFile}
                  onOpenFile={onOpenFile}
                />
                {afterAttachments}
                {belowDescriptionNode}
                {errorNode}
              </div>
            </div>
          </div>
        </div>
        {usePropertiesRail ? (
          <ResizableSidePanel
            storageKey={TASK_PROPERTIES_PANEL_WIDTH_KEY}
            legacyStorageKeys={TASK_PROPERTIES_PANEL_LEGACY_WIDTH_KEYS}
            edge="start"
            className="detail-properties-panel"
          >
            <div className="detail-properties-panel__inner">
              <TaskPropertiesDisplay
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
                assigneeNavigateHref={assigneeNavigateHref}
                projectNavigateHref={projectNavigateHref}
                onCreateAssigneeFromQuery={onCreateAssigneeFromQuery}
                onCreateRelatedContactFromQuery={
                  onCreateRelatedContactFromQuery
                }
                agentInboxPending={agentInboxPending}
                onAgentInboxApprove={onAgentInboxApprove}
                onTrackedDurationSecondsChange={
                  onTrackedDurationSecondsChange
                }
                onTimerSessionChange={onTimerSessionChange}
                timerSession={timerSession}
              />
              {viewModeDock}
            </div>
          </ResizableSidePanel>
        ) : null}
      </div>
    </div>
  );
}
