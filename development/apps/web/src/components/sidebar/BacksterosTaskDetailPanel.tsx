import { RefreshCwIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import * as Schema from "effect/Schema";

import { BacksterosContactPersonIcon } from "~/backsteros/ContactPersonIcon";
import { DefaultProjectIcon } from "~/backsteros/DefaultProjectIcon";
import { BacksterosDueDatePropertyMenu } from "~/backsteros/DueDatePropertyMenu";
import { BacksterosEntityAvatarIcon } from "~/backsteros/EntityAvatarIcon";
import { ProjectOcticon } from "~/backsteros/ProjectOcticon";
import {
  BacksterosMarkdownDescription,
  useBacksterosMarkdownDetailEditor,
} from "~/backsteros/markdown-editor";
import { useContentViewModeShortcut } from "~/backsteros/markdown-editor/useContentViewModeShortcut";
import { BacksterosOverviewNameEditor } from "~/backsteros/OverviewNameEditor";
import { isTitleRenameShortcut, useTitleRenameShortcut } from "~/backsteros/useTitleRenameShortcut";
import { useTaskPropertyDropdownShortcuts } from "~/backsteros/useTaskPropertyDropdownShortcuts";
import { BacksterosRelatedPropertyChips } from "~/backsteros/RelatedPropertyChips";
import {
  BacksterosSearchablePropertyMenu,
  type BacksterosSearchablePropertyOption,
} from "~/backsteros/SearchablePropertyMenu";
import { FloatingPillToggleDock, SegmentedPillToggle } from "~/backsteros/SegmentedPillToggle";
import { SidePanelToggleIcon } from "~/backsteros/SidePanelToggleIcon";
import { BacksterosContentCrossfade } from "~/backsteros/BacksterosContentCrossfade";
import { BacksterosTaskActivityTimeline } from "~/backsteros/TaskActivityTimeline";
import { BacksterosTaskCommentsSection } from "~/backsteros/TaskCommentsSection";
import { BacksterosTaskPriorityIcon } from "~/backsteros/TaskPriorityIcon";
import { BacksterosTaskStatusIcon } from "~/backsteros/TaskStatusIcon";
import { BacksterosTrackedTimeField } from "~/backsteros/TrackedTimeField";
import {
  BACKSTEROS_TASK_PRIORITY_LABELS,
  getBacksterosTaskPriorityLabel,
} from "~/backsteros/taskDetailFormat";
import {
  clampTaskDetailPanelWidth,
  resolveInitialTaskDetailPanelWidth,
  TASK_DETAIL_PANEL_WIDTH_STORAGE_KEY,
} from "~/backsteros/taskDetailPanelWidth";
import {
  useBacksterosAvatarSrcMap,
  useBacksterosContactAvatarSrcMap,
} from "~/backsteros/useBacksterosContactAvatars";
import { useBacksterosCodebaseProjects } from "~/backsteros/useBacksterosCodebaseProjects";
import { useBacksterosTaskDetailUiStore } from "~/backsteros/taskDetailUiStore";
import {
  getBacksterosTaskDisplayId,
  type BacksterosCodebaseProject,
  type BacksterosContact,
  type BacksterosOrganization,
  type BacksterosTaskUpdatePatch,
} from "~/backsteros/types";
import { useBacksterosTaskDetail } from "~/backsteros/useBacksterosTaskDetail";
import { useBacksterosDisplayedWorkingTaskIds } from "~/backsteros/useBacksterosAgentPresence";
import { useBacksterosTaskChatStore } from "~/backsteros/taskChatStore";
import {
  BACKSTEROS_TASK_STATUS_ORDER,
  getBacksterosTaskStatusLabel,
  migrateBacksterosTaskStatus,
  type BacksterosTaskStatus,
} from "~/backsteros/taskStatus";
import { useTaskDescriptionImages } from "~/backsteros/useTaskDescriptionImages";
import { isElectron } from "~/env";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import "~/backsteros/backsterosPropertyMenu.css";

const UNASSIGNED_VALUE = "__unassigned__";
const NO_PROJECT_VALUE = "__no_project__";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

function readInitialPanelWidth(): number {
  try {
    return resolveInitialTaskDetailPanelWidth(
      getLocalStorageItem(TASK_DETAIL_PANEL_WIDTH_STORAGE_KEY, Schema.Finite),
      window.innerWidth,
    );
  } catch (error) {
    console.error("Could not read persisted task detail panel width.", error);
    return resolveInitialTaskDetailPanelWidth(null, window.innerWidth);
  }
}

function BacksterosTaskDescriptionSection(props: {
  readonly taskId: string;
  readonly description: string | null;
  readonly onSave: (next: string | null) => Promise<void>;
}) {
  const { taskId, description, onSave } = props;
  const setDescriptionEditing = useBacksterosTaskDetailUiStore(
    (state) => state.setDescriptionEditing,
  );
  const saveDescription = useCallback(
    async (nextValue: string) => {
      const next = nextValue.trim() || null;
      const current = description?.trim() || null;
      if (next === current) return;
      await onSave(next);
    },
    [description, onSave],
  );

  const { value, mode, handleChange, handleBlurSave, setViewMode, toggleViewMode } =
    useBacksterosMarkdownDetailEditor({
      initialValue: description ?? "",
      save: saveDescription,
    });

  const { onUploadImages } = useTaskDescriptionImages(taskId);

  const descriptionHostRef = useRef<HTMLDivElement | null>(null);
  useContentViewModeShortcut({
    enabled: true,
    onToggle: toggleViewMode,
    onForcePreview: () => setViewMode("preview"),
    hostRef: descriptionHostRef,
  });

  useEffect(() => {
    setDescriptionEditing(taskId, mode === "edit");
    return () => {
      setDescriptionEditing(taskId, false);
    };
  }, [mode, setDescriptionEditing, taskId]);

  // Leaving the description editor (Escape / ⌘R title rename) always returns
  // to Preview so property hotkeys and kickoff send stay unblocked.
  useEffect(() => {
    if (mode !== "edit") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.repeat) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setViewMode("preview");
        return;
      }

      if (isTitleRenameShortcut(event)) {
        setViewMode("preview");
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [mode, setViewMode]);

  return (
    <div className="bos-task-description-section" ref={descriptionHostRef}>
      <BacksterosMarkdownDescription
        mode={mode}
        value={value}
        onChange={handleChange}
        onBlur={handleBlurSave}
        ariaLabel="Task description"
        placeholder="Add a description…"
        emptyMessage="Add a description…"
        onUploadImages={onUploadImages}
        toggle={
          <FloatingPillToggleDock>
            <SegmentedPillToggle
              value={mode}
              options={[
                { value: "preview", label: "Preview" },
                { value: "edit", label: "Edit" },
              ]}
              onChange={setViewMode}
              ariaLabel="Content view mode"
            />
          </FloatingPillToggleDock>
        }
      />
    </div>
  );
}

function TaskDetailPanelResizeRail(props: {
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly width: number;
  readonly onWidthChange: (width: number) => void;
  readonly onResetWidth: () => void;
}) {
  const { panelRef, width, onWidthChange, onResetWidth } = props;
  const railRef = useRef<HTMLButtonElement | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;
  const resizeStateRef = useRef<{
    moved: boolean;
    pointerId: number;
    pendingWidth: number;
    rafId: number | null;
    reservedLeft: number;
    startWidth: number;
    startX: number;
    width: number;
  } | null>(null);

  const stopResize = useCallback(
    (pointerId: number) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      if (resizeState.rafId !== null) {
        window.cancelAnimationFrame(resizeState.rafId);
      }
      try {
        setLocalStorageItem(TASK_DETAIL_PANEL_WIDTH_STORAGE_KEY, resizeState.width, Schema.Finite);
      } catch (error) {
        console.error("Could not persist task detail panel width.", error);
      }
      onWidthChange(resizeState.width);
      resizeStateRef.current = null;
      const rail = railRef.current;
      if (rail?.hasPointerCapture(pointerId)) {
        rail.releasePointerCapture(pointerId);
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    },
    [onWidthChange],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const panel = panelRef.current;
      if (!panel) return;

      const reservedLeft = Math.max(0, Math.round(panel.getBoundingClientRect().left));
      const startWidth = clampTaskDetailPanelWidth(
        widthRef.current,
        window.innerWidth,
        reservedLeft,
      );

      event.preventDefault();
      event.stopPropagation();
      resizeStateRef.current = {
        moved: false,
        pointerId: event.pointerId,
        pendingWidth: startWidth,
        rafId: null,
        reservedLeft,
        startWidth,
        startX: event.clientX,
        width: startWidth,
      };
      panel.style.width = `${startWidth}px`;
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [panelRef],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;

      event.preventDefault();
      const delta = event.clientX - resizeState.startX;
      if (Math.abs(delta) > 2) resizeState.moved = true;
      resizeState.pendingWidth = clampTaskDetailPanelWidth(
        resizeState.startWidth + delta,
        window.innerWidth,
        resizeState.reservedLeft,
      );
      if (resizeState.rafId !== null) return;

      resizeState.rafId = window.requestAnimationFrame(() => {
        const active = resizeStateRef.current;
        if (!active) return;
        active.rafId = null;
        const nextWidth = active.pendingWidth;
        const panel = panelRef.current;
        if (panel) panel.style.width = `${nextWidth}px`;
        active.width = nextWidth;
        onWidthChange(nextWidth);
      });
    },
    [onWidthChange, panelRef],
  );

  const endResizeInteraction = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      event.preventDefault();
      stopResize(event.pointerId);
    },
    [stopResize],
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            ref={railRef}
            type="button"
            aria-label="Resize task details"
            title="Drag to resize · double-click to reset"
            className={cn(
              "absolute inset-y-0 right-0 z-20 w-3 translate-x-1/2 cursor-col-resize",
              "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2",
              "after:bg-transparent hover:after:bg-sidebar-border",
              "[[data-panel-animations=true]_&]:transition-colors",
            )}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endResizeInteraction}
            onPointerCancel={endResizeInteraction}
            onDoubleClick={(event) => {
              event.preventDefault();
              onResetWidth();
            }}
          />
        }
      />
      <TooltipPopup side="right">Drag to resize</TooltipPopup>
    </Tooltip>
  );
}

export function BacksterosTaskDetailPanel() {
  const selection = useBacksterosTaskDetailUiStore((state) => state.selection);
  const closeTaskDetail = useBacksterosTaskDetailUiStore((state) => state.closeTaskDetail);
  const setTaskDetailProject = useBacksterosTaskDetailUiStore(
    (state) => state.setTaskDetailProject,
  );
  const { state: sidebarState } = useSidebar();
  const navCollapsed = sidebarState === "collapsed";
  const panelRef = useRef<HTMLElement | null>(null);
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const [panelWidth, setPanelWidth] = useState(readInitialPanelWidth);
  const { state, reload, addComment, editComment, deleteComment, patchTask, postTimerActivity } =
    useBacksterosTaskDetail(selection?.taskId ?? null);
  const { state: projectsState } = useBacksterosCodebaseProjects(Boolean(selection));

  const resetPanelWidth = useCallback(() => {
    try {
      removeLocalStorageItem(TASK_DETAIL_PANEL_WIDTH_STORAGE_KEY);
    } catch (error) {
      console.error("Could not clear persisted task detail panel width.", error);
    }
    const reservedLeft = panelRef.current
      ? Math.max(0, Math.round(panelRef.current.getBoundingClientRect().left))
      : 0;
    const next = resolveInitialTaskDetailPanelWidth(null, window.innerWidth, reservedLeft);
    setPanelWidth(next);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    const reservedLeft = panel ? Math.max(0, Math.round(panel.getBoundingClientRect().left)) : 0;
    setPanelWidth((current) => clampTaskDetailPanelWidth(current, viewportWidth, reservedLeft));
  }, [viewportWidth]);

  // Keep the chat-header task id (BSH-11) fresh when the detail rail is open.
  useEffect(() => {
    if (state.status !== "ready" || !selection?.taskId) return;
    const binding = useBacksterosTaskChatStore.getState().getBinding(selection.taskId);
    if (!binding) return;
    const displayId = getBacksterosTaskDisplayId(state.task, selection.project.key);
    if (
      binding.displayId === displayId &&
      binding.title === state.task.title &&
      binding.projectTitle === selection.project.name
    ) {
      return;
    }
    useBacksterosTaskChatStore.getState().setBinding(selection.taskId, {
      ...binding,
      displayId,
      title: state.task.title,
      projectTitle: selection.project.name,
    });
  }, [selection, state]);

  const selectionProject = selection?.project ?? null;
  const codebaseProjects: readonly BacksterosCodebaseProject[] =
    projectsState.status === "ready"
      ? projectsState.projects
      : selectionProject
        ? [selectionProject]
        : [];

  // Prefer the live projects fetch so property icons stay in sync with desktop.
  const project: BacksterosCodebaseProject | null = useMemo(() => {
    if (!selectionProject) return null;
    return codebaseProjects.find((entry) => entry.id === selectionProject.id) ?? selectionProject;
  }, [codebaseProjects, selectionProject]);

  const displayId = useMemo(() => {
    if (state.status !== "ready" || !project) return null;
    return getBacksterosTaskDisplayId(state.task, project.key);
  }, [project, state]);

  const applyPatch = useCallback(
    async (patch: BacksterosTaskUpdatePatch, failureTitle: string) => {
      // Property chips update optimistically inside patchTask; only toast on failure.
      try {
        await patchTask(patch);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: failureTitle,
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [patchTask],
  );

  const handleSaveTitle = useCallback(
    async (nextTitle: string) => {
      try {
        await patchTask({ title: nextTitle });
        return { ok: true as const };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : "Could not update title",
        };
      }
    },
    [patchTask],
  );

  const [titleRenameFocusRequest, setTitleRenameFocusRequest] = useState(0);
  const descriptionEditingTaskId = useBacksterosTaskDetailUiStore(
    (state) => state.descriptionEditingTaskId,
  );
  const composeProject = useBacksterosTaskDetailUiStore((state) => state.composeProject);
  useTitleRenameShortcut(() => setTitleRenameFocusRequest((n) => n + 1), {
    enabled: selection?.taskId != null && state.status === "ready" && composeProject == null,
  });
  // Compose modal owns S/P/A/… while open; re-bind to this task when it closes.
  useTaskPropertyDropdownShortcuts({
    enabled: selection != null && descriptionEditingTaskId == null && composeProject == null,
  });

  const handleSaveDescription = useCallback(
    async (next: string | null) => {
      await applyPatch({ description: next }, "Could not update description");
    },
    [applyPatch],
  );

  const statusOptions = useMemo(
    (): BacksterosSearchablePropertyOption<BacksterosTaskStatus>[] =>
      BACKSTEROS_TASK_STATUS_ORDER.map((status) => ({
        value: status,
        label: getBacksterosTaskStatusLabel(status),
        searchText: status.replaceAll("_", " "),
        icon: <BacksterosTaskStatusIcon status={status} size={14} />,
      })),
    [],
  );

  const priorityOptions = useMemo(
    (): BacksterosSearchablePropertyOption[] =>
      BACKSTEROS_TASK_PRIORITY_LABELS.map((label, priority) => ({
        value: String(priority),
        label,
        icon: <BacksterosTaskPriorityIcon priority={priority} size={14} />,
      })),
    [],
  );

  const contacts: readonly BacksterosContact[] = state.status === "ready" ? state.contacts : [];
  const organizations: readonly BacksterosOrganization[] =
    state.status === "ready" ? state.organizations : [];
  const avatarEntities = useMemo(() => {
    const byId = new Map<string, BacksterosContact>();
    for (const contact of contacts) byId.set(contact.id, contact);
    if (state.status === "ready" && state.assignee) {
      byId.set(state.assignee.id, state.assignee);
    }
    return [...byId.values()];
  }, [contacts, state]);
  const avatarSrcById = useBacksterosContactAvatarSrcMap(avatarEntities);
  const organizationAvatarSrcById = useBacksterosAvatarSrcMap("organization", organizations);
  const workingTaskIds = useBacksterosDisplayedWorkingTaskIds();
  const agentWorking = selection?.taskId != null && workingTaskIds.has(selection.taskId);
  const assigneeAvatarSrc =
    state.status === "ready" && state.assignee ? (avatarSrcById[state.assignee.id] ?? null) : null;

  const assigneeOptions = useMemo((): BacksterosSearchablePropertyOption[] => {
    const unassigned: BacksterosSearchablePropertyOption = {
      value: UNASSIGNED_VALUE,
      label: "Unassigned",
      searchText: "unassigned none clear",
      icon: <BacksterosContactPersonIcon size={14} className="opacity-70" />,
    };
    const contactOptions = contacts.map((contact, index) => ({
      value: contact.id,
      label: contact.name,
      searchText: [contact.name, contact.firstName, contact.lastName, contact.email]
        .filter(Boolean)
        .join(" "),
      icon: <BacksterosEntityAvatarIcon src={avatarSrcById[contact.id] ?? null} size={14} />,
      separatorBefore: index === 0,
    }));
    return [unassigned, ...contactOptions];
  }, [avatarSrcById, contacts]);

  const projectOptions = useMemo((): BacksterosSearchablePropertyOption[] => {
    const none: BacksterosSearchablePropertyOption = {
      value: NO_PROJECT_VALUE,
      label: "No project",
      searchText: "none clear unassigned inbox",
      icon: <DefaultProjectIcon size={14} className="shrink-0 opacity-70" />,
    };
    const entries = codebaseProjects.map((entry, index) => ({
      value: entry.id,
      label: entry.name,
      searchText: [entry.name, entry.key].filter(Boolean).join(" "),
      icon: (
        <ProjectOcticon
          icon={entry.icon}
          type={entry.type}
          size={14}
          className="shrink-0 opacity-70"
        />
      ),
      separatorBefore: index === 0,
    }));
    return [none, ...entries];
  }, [codebaseProjects]);

  const handleProjectChange = useCallback(
    async (nextProjectId: string | null) => {
      const currentId = state.status === "ready" ? state.task.projectId : (project?.id ?? null);
      if (nextProjectId === currentId) return;

      await applyPatch(
        nextProjectId
          ? { projectId: nextProjectId, inbox: false }
          : { projectId: null, inbox: true },
        "Could not update project",
      );

      if (nextProjectId) {
        const nextProject = codebaseProjects.find((entry) => entry.id === nextProjectId) ?? null;
        if (nextProject) setTaskDetailProject(nextProject);
      }
    },
    [applyPatch, codebaseProjects, project?.id, setTaskDetailProject, state],
  );

  if (!selection) return null;

  const statusValue: BacksterosTaskStatus =
    state.status === "ready" ? migrateBacksterosTaskStatus(state.task.status) : "triage";
  const priorityValue = state.status === "ready" ? (state.task.priority ?? 0) : 0;

  const hideLabel = "Hide task details";
  const titleLabel = displayId ?? "Task";
  const hideTaskButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={closeTaskDetail}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground no-drag"
            aria-label={hideLabel}
            aria-pressed={true}
          >
            <SidePanelToggleIcon size={16} rail="start" collapsed={false} />
          </button>
        }
      />
      <TooltipPopup side="bottom">{hideLabel}</TooltipPopup>
    </Tooltip>
  );
  const taskIdLabel = (
    <span className="min-w-0 truncate text-xs font-medium tracking-wide text-muted-foreground no-drag">
      {titleLabel}
    </span>
  );

  return (
    <aside
      ref={panelRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width: panelWidth }}
      aria-label="BacksterOS task details"
    >
      {/* Resize handle mirrors the left nav rail (drag edge · double-click resets). */}
      <TaskDetailPanelResizeRail
        panelRef={panelRef}
        width={panelWidth}
        onWidthChange={setPanelWidth}
        onResetWidth={resetPanelWidth}
      />
      <BacksterosContentCrossfade
        contentKey={`task:${selection.taskId}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {() => (
          <>
            <div
              className={cn(
                "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1.5 px-2",
                isElectron && "drag-region",
                // When the main nav is offcanvas, this panel is flush left under the
                // traffic lights + fixed SidebarTrigger — inset past both, then put
                // the task id immediately after the nav toggle.
                COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
              )}
            >
              {navCollapsed ? (
                <>
                  {taskIdLabel}
                  <div className="ml-auto flex shrink-0">{hideTaskButton}</div>
                </>
              ) : (
                <>
                  {hideTaskButton}
                  {taskIdLabel}
                </>
              )}
            </div>

            {state.status === "loading" || state.status === "idle" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
                <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
                Loading task…
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-xs text-muted-foreground">
                <p className="max-w-[16rem] text-balance">{state.message}</p>
                <Button type="button" size="xs" variant="outline" onClick={reload}>
                  Retry
                </Button>
              </div>
            ) : null}

            {state.status === "ready" ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 -mt-3 pb-3">
                  <BacksterosOverviewNameEditor
                    value={state.task.title}
                    entityLabel="Task"
                    resetKey={state.task.id}
                    renameFocusRequest={titleRenameFocusRequest}
                    onSave={handleSaveTitle}
                  />

                  <div className="bos-task-detail-properties mt-6">
                    <BacksterosSearchablePropertyMenu
                      label={getBacksterosTaskStatusLabel(statusValue)}
                      icon={
                        <BacksterosTaskStatusIcon
                          status={statusValue}
                          size={12}
                          className="shrink-0"
                        />
                      }
                      value={statusValue}
                      options={statusOptions}
                      searchPlaceholder="Change status…"
                      taskPropertyDropdownId="status"
                      onChange={(value) => {
                        void applyPatch({ status: value }, "Could not update status");
                      }}
                    />

                    <BacksterosSearchablePropertyMenu
                      label={getBacksterosTaskPriorityLabel(priorityValue)}
                      icon={<BacksterosTaskPriorityIcon priority={priorityValue} size={12} />}
                      value={String(priorityValue)}
                      options={priorityOptions}
                      searchPlaceholder="Change priority…"
                      taskPropertyDropdownId="priority"
                      onChange={(value) => {
                        void applyPatch({ priority: Number(value) }, "Could not update priority");
                      }}
                    />

                    <BacksterosDueDatePropertyMenu
                      dueDate={state.task.dueDate}
                      status={state.task.status}
                      onChange={(dueDate) => {
                        void applyPatch({ dueDate }, "Could not update due date");
                      }}
                    />

                    <BacksterosSearchablePropertyMenu
                      label={state.assignee?.name ?? "Unassigned"}
                      muted={!state.assignee}
                      icon={
                        state.assignee ? (
                          <BacksterosEntityAvatarIcon src={assigneeAvatarSrc} size={12} />
                        ) : (
                          <BacksterosContactPersonIcon size={12} className="opacity-70" />
                        )
                      }
                      value={state.task.assigneeId ?? UNASSIGNED_VALUE}
                      options={assigneeOptions}
                      searchPlaceholder="Change assignee…"
                      taskPropertyDropdownId="assignee"
                      onChange={(value) => {
                        void applyPatch(
                          { assigneeId: value === UNASSIGNED_VALUE ? null : value },
                          "Could not update assignee",
                        );
                      }}
                    />

                    <BacksterosRelatedPropertyChips
                      contactIds={state.task.relatedContactIds}
                      organizationIds={state.task.relatedOrganizationIds}
                      contacts={contacts}
                      organizations={organizations}
                      contactAvatarSrcById={avatarSrcById}
                      organizationAvatarSrcById={organizationAvatarSrcById}
                      onChange={(related) => {
                        void applyPatch(
                          {
                            relatedContactIds: related.contactIds,
                            relatedOrganizationIds: related.organizationIds,
                          },
                          "Could not update related",
                        );
                      }}
                    />

                    <BacksterosSearchablePropertyMenu
                      label={project?.name ?? "No project"}
                      muted={!project}
                      icon={
                        project ? (
                          <ProjectOcticon
                            icon={project.icon}
                            type={project.type}
                            size={12}
                            className="shrink-0 opacity-70"
                          />
                        ) : (
                          <DefaultProjectIcon size={12} className="shrink-0 opacity-70" />
                        )
                      }
                      value={project?.id ?? state.task.projectId ?? NO_PROJECT_VALUE}
                      options={projectOptions}
                      searchPlaceholder="Change project…"
                      taskPropertyDropdownId="project"
                      onChange={(value) => {
                        void handleProjectChange(value === NO_PROJECT_VALUE ? null : value);
                      }}
                    />

                    <BacksterosTrackedTimeField
                      timerKey={state.task.id}
                      trackedDurationSeconds={state.task.trackedDurationSeconds ?? null}
                      trackedMinutes={state.task.trackedMinutes ?? null}
                      onTrackedDurationSecondsChange={(seconds) => {
                        const trackedMinutes =
                          seconds != null && seconds >= 60 ? Math.floor(seconds / 60) : null;
                        void applyPatch(
                          {
                            trackedDurationSeconds: seconds,
                            trackedMinutes,
                          },
                          "Could not update tracked time",
                        );
                      }}
                      onTimerSessionChange={postTimerActivity}
                    />
                  </div>

                  <BacksterosTaskDescriptionSection
                    key={state.task.id}
                    taskId={state.task.id}
                    description={state.task.description}
                    onSave={handleSaveDescription}
                  />

                  <div className="mt-5 border-t border-border/50 pt-3">
                    <div className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      Activity
                    </div>
                    <BacksterosTaskActivityTimeline
                      activities={state.activities}
                      avatarSrcByContactId={avatarSrcById}
                      working={agentWorking}
                    />
                  </div>

                  <div className="mt-5 border-t border-border/50 pt-3">
                    <BacksterosTaskCommentsSection
                      taskId={state.task.id}
                      comments={state.comments}
                      contacts={contacts}
                      avatarSrcByContactId={avatarSrcById}
                      onAdd={addComment}
                      onEdit={editComment}
                      onDelete={deleteComment}
                    />
                  </div>
                </div>
              </>
            ) : null}
          </>
        )}
      </BacksterosContentCrossfade>
    </aside>
  );
}
