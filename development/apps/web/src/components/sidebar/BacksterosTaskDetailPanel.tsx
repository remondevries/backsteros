import {
  RefreshCwIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { BacksterosContactPersonIcon } from "~/backsteros/ContactPersonIcon";
import { BacksterosDueDatePropertyMenu } from "~/backsteros/DueDatePropertyMenu";
import { BacksterosEntityAvatarIcon } from "~/backsteros/EntityAvatarIcon";
import { BacksterosRelatedPropertyChips } from "~/backsteros/RelatedPropertyChips";
import { SidePanelToggleIcon } from "~/backsteros/SidePanelToggleIcon";
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
  useBacksterosAvatarSrcMap,
  useBacksterosContactAvatarSrcMap,
} from "~/backsteros/useBacksterosContactAvatars";
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
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { Button } from "../ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { BacksterosCreateTaskForm } from "./BacksterosCreateTaskForm";
import "~/backsteros/backsterosPropertyMenu.css";

const DETAIL_PANEL_WIDTH_PX = 380;

function PropertyChipMenu(props: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly searchHint: string;
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly muted?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger
        disabled={props.disabled}
        className={cn(
          "bos-task-property-chip",
          props.muted && "bos-task-property-chip--muted",
        )}
        aria-label={props.label}
      >
        <span className="bos-task-property-chip__icon">{props.icon}</span>
        <span className="bos-task-property-chip__label">{props.label}</span>
      </MenuTrigger>
      <MenuPopup align="start" className="bos-task-property-menu">
        <div className="bos-task-property-menu__search">{props.searchHint}</div>
        {props.children}
      </MenuPopup>
    </Menu>
  );
}

export function BacksterosTaskDetailPanel() {
  const selection = useBacksterosTaskDetailUiStore((state) => state.selection);
  const closeTaskDetail = useBacksterosTaskDetailUiStore((state) => state.closeTaskDetail);
  const { state: sidebarState } = useSidebar();
  const navCollapsed = sidebarState === "collapsed";
  const {
    state,
    reload,
    addComment,
    editComment,
    deleteComment,
    patchTask,
    postTimerActivity,
  } = useBacksterosTaskDetail(selection?.taskId ?? null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  useEffect(() => {
    setEditingDescription(false);
    setEditingTitle(false);
  }, [selection?.taskId]);

  useEffect(() => {
    if (state.status !== "ready") return;
    if (!editingDescription) setDescriptionDraft(state.task.description ?? "");
    if (!editingTitle) setTitleDraft(state.task.title);
  }, [editingDescription, editingTitle, state]);

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

  const project: BacksterosCodebaseProject | null = selection?.project ?? null;

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

  const handleSaveTitle = useCallback(async () => {
    if (state.status !== "ready") return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === state.task.title) {
      setEditingTitle(false);
      setTitleDraft(state.task.title);
      return;
    }
    await applyPatch({ title: trimmed }, "Could not update title");
    setEditingTitle(false);
  }, [applyPatch, state, titleDraft]);

  const handleSaveDescription = useCallback(async () => {
    if (state.status !== "ready") return;
    const next = descriptionDraft.trim() || null;
    const current = state.task.description?.trim() || null;
    if (next === current) {
      setEditingDescription(false);
      return;
    }
    await applyPatch({ description: next }, "Could not update description");
    setEditingDescription(false);
  }, [applyPatch, descriptionDraft, state]);

  const contacts: readonly BacksterosContact[] =
    state.status === "ready" ? state.contacts : [];
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
  const organizationAvatarSrcById = useBacksterosAvatarSrcMap(
    "organization",
    organizations,
  );
  const workingTaskIds = useBacksterosDisplayedWorkingTaskIds();
  const agentWorking =
    selection?.taskId != null && workingTaskIds.has(selection.taskId);
  const assigneeAvatarSrc =
    state.status === "ready" && state.assignee
      ? (avatarSrcById[state.assignee.id] ?? null)
      : null;

  if (!selection) return null;

  const isCreateMode = selection.taskId === null;
  const statusValue: BacksterosTaskStatus =
    state.status === "ready" ? migrateBacksterosTaskStatus(state.task.status) : "triage";
  const priorityValue = state.status === "ready" ? (state.task.priority ?? 0) : 0;

  const hideLabel = isCreateMode ? "Hide create task" : "Hide task details";
  const titleLabel = isCreateMode ? "New task" : (displayId ?? "Task");
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
      className="flex h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width: DETAIL_PANEL_WIDTH_PX }}
      aria-label={isCreateMode ? "Create BacksterOS task" : "BacksterOS task details"}
    >
      <div
        className={cn(
          "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1.5 border-b border-sidebar-border/60 px-2",
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

      {isCreateMode ? <BacksterosCreateTaskForm project={selection.project} /> : null}

      {!isCreateMode && (state.status === "loading" || state.status === "idle") ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-xs text-muted-foreground">
          <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
          Loading task…
        </div>
      ) : null}

      {!isCreateMode && state.status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-xs text-muted-foreground">
          <p className="max-w-[16rem] text-balance">{state.message}</p>
          <Button type="button" size="xs" variant="outline" onClick={reload}>
            Retry
          </Button>
        </div>
      ) : null}

      {!isCreateMode && state.status === "ready" ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {editingTitle ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveTitle();
                    } else if (event.key === "Escape") {
                      setEditingTitle(false);
                      setTitleDraft(state.task.title);
                    }
                  }}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-base font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setEditingTitle(false);
                      setTitleDraft(state.task.title);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    onClick={() => void handleSaveTitle()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="w-full rounded-sm text-left text-base font-semibold leading-snug text-foreground text-balance transition-colors hover:text-foreground/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {state.task.title}
              </button>
            )}

            <div className="bos-task-detail-properties mt-3">
              <PropertyChipMenu
                searchHint="Change status…"
                label={getBacksterosTaskStatusLabel(statusValue)}
                icon={
                  <BacksterosTaskStatusIcon status={statusValue} size={12} className="shrink-0" />
                }
              >
                <MenuRadioGroup
                  value={statusValue}
                  onValueChange={(value) => {
                    void applyPatch(
                      { status: value as BacksterosTaskStatus },
                      "Could not update status",
                    );
                  }}
                >
                  {BACKSTEROS_TASK_STATUS_ORDER.map((status) => (
                    <MenuRadioItem
                      key={status}
                      value={status}
                      closeOnClick
                      className="bos-task-property-menu__option"
                    >
                      <span className="bos-task-property-menu__option-icon">
                        <BacksterosTaskStatusIcon status={status} size={14} />
                      </span>
                      <span className="bos-task-property-menu__option-label">
                        {getBacksterosTaskStatusLabel(status)}
                      </span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </PropertyChipMenu>

              <PropertyChipMenu
                searchHint="Change priority…"
                label={getBacksterosTaskPriorityLabel(priorityValue)}
                icon={<BacksterosTaskPriorityIcon priority={priorityValue} size={12} />}
              >
                <MenuRadioGroup
                  value={String(priorityValue)}
                  onValueChange={(value) => {
                    void applyPatch(
                      { priority: Number(value) },
                      "Could not update priority",
                    );
                  }}
                >
                  {BACKSTEROS_TASK_PRIORITY_LABELS.map((label, priority) => (
                    <MenuRadioItem
                      key={label}
                      value={String(priority)}
                      closeOnClick
                      className="bos-task-property-menu__option"
                    >
                      <span className="bos-task-property-menu__option-icon">
                        <BacksterosTaskPriorityIcon priority={priority} size={14} />
                      </span>
                      <span className="bos-task-property-menu__option-label">{label}</span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </PropertyChipMenu>

              <BacksterosDueDatePropertyMenu
                dueDate={state.task.dueDate}
                status={state.task.status}
                onChange={(dueDate) => {
                  void applyPatch({ dueDate }, "Could not update due date");
                }}
              />

              <PropertyChipMenu
                searchHint="Change assignee…"
                label={state.assignee?.name ?? "Unassigned"}
                muted={!state.assignee}
                icon={
                  state.assignee ? (
                    <BacksterosEntityAvatarIcon
                      src={assigneeAvatarSrc}
                      size={12}
                    />
                  ) : (
                    <BacksterosContactPersonIcon size={12} className="opacity-70" />
                  )
                }
              >
                <MenuRadioGroup
                  value={state.task.assigneeId ?? "__unassigned__"}
                  onValueChange={(value) => {
                    void applyPatch(
                      { assigneeId: value === "__unassigned__" ? null : value },
                      "Could not update assignee",
                    );
                  }}
                >
                  <MenuRadioItem
                    value="__unassigned__"
                    closeOnClick
                    className="bos-task-property-menu__option"
                  >
                    <span className="bos-task-property-menu__option-main">
                      <span className="bos-task-property-menu__option-icon">
                        <BacksterosContactPersonIcon size={14} className="opacity-70" />
                      </span>
                      <span className="bos-task-property-menu__option-label">
                        Unassigned
                      </span>
                    </span>
                  </MenuRadioItem>
                  <MenuSeparator className="bos-task-property-menu__separator" />
                  {contacts.map((contact) => (
                    <MenuRadioItem
                      key={contact.id}
                      value={contact.id}
                      closeOnClick
                      className="bos-task-property-menu__option"
                    >
                      <span className="bos-task-property-menu__option-main">
                        <span className="bos-task-property-menu__option-icon">
                          <BacksterosEntityAvatarIcon
                            src={avatarSrcById[contact.id] ?? null}
                            size={14}
                          />
                        </span>
                        <span className="bos-task-property-menu__option-label">
                          {contact.name}
                        </span>
                      </span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </PropertyChipMenu>

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
              {project ? (
                <span className="bos-task-property-chip bos-task-property-chip--static">
                  <span className="bos-task-property-chip__icon">
                    <TerminalIcon className="size-3 shrink-0 opacity-70" />
                  </span>
                  <span className="bos-task-property-chip__label">{project.name}</span>
                </span>
              ) : null}
              <BacksterosTrackedTimeField
                trackedDurationSeconds={state.task.trackedDurationSeconds}
                trackedMinutes={state.task.trackedMinutes}
                onTrackedDurationSecondsChange={(seconds) => {
                  const trackedMinutes =
                    seconds != null && seconds >= 60
                      ? Math.floor(seconds / 60)
                      : null;
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

            <div className="mt-4 border-t border-border/50 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Description
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 py-0.5 transition-colors",
                      !editingDescription
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setEditingDescription(false)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded px-1.5 py-0.5 transition-colors",
                      editingDescription
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      setDescriptionDraft(state.task.description ?? "");
                      setEditingDescription(true);
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
              {editingDescription ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    rows={6}
                    className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Add a description…"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setEditingDescription(false);
                        setDescriptionDraft(state.task.description ?? "");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => void handleSaveDescription()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : state.task.description?.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {state.task.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/70">No description</p>
              )}
            </div>

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
    </aside>
  );
}
