"use client";

import type { BacksterosApiClient } from "@backsteros/api-client";
import type {
  Contact as ApiContact,
  Project as ApiProject,
  Task as ApiTask,
} from "@backsteros/contracts";
import {
  InboxDetailLayout,
  InboxSidePanelView,
  TaskStackedDetailView,
  buildAssigneeDropdownOptions,
  buildInboxTaskListItem,
  buildProjectDropdownOptions,
  findInboxItemBySlugOrId,
  getFirstInboxItemHref,
  INBOX_ATTENTION_STATUS_ORDER,
  migrateLegacyTaskStatus,
  sortInboxItemsByAttentionStatus,
  DotScrollLoader,
  type InboxListItem,
  type InboxListItemLinkComponent,
  type TaskStatus,
} from "@backsteros/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  ProjectsSidePanelIcon,
} from "@/components/panel-icons";
import { TaskActivityPanel } from "@/components/task-activity-panel";
import { useApiResource, useConsoleApi } from "@/lib/api-context";
import {
  useConsoleAvatarSrcMap,
  withAvatarSrc,
} from "@/lib/avatar-src";
import {
  holdTaskForAgent as holdTaskForAgentRequest,
  reviewTaskForAgent,
} from "@/lib/agent-task-mutations";
import {
  buildLaunchFailedHold,
  formatAgentHoldComment,
  type AgentHoldDecision,
} from "@/lib/agent-hold";
import type {
  AgentAttachRequest,
  AgentEndRequest,
} from "@/lib/cursor-agent-cli";
import { mapApiTaskDetail } from "@/lib/map-task";
import type { TaskAgentSession } from "@/lib/task-agent-sessions";

const ATTENTION_STATUSES = INBOX_ATTENTION_STATUS_ORDER;

function asEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function mapAttentionItem(
  task: ApiTask,
  projectsById: Map<string, ApiProject>,
): InboxListItem {
  const project = task.projectId
    ? (projectsById.get(task.projectId) ?? null)
    : null;
  return buildInboxTaskListItem({
    id: task.id,
    title: task.title,
    number: task.number,
    status: task.status,
    priority: task.priority,
    dueDate: asEpoch(task.dueDate),
    updatedAt: asEpoch(task.updatedAt) ?? Date.now(),
    description: task.description,
    projectId: task.projectId,
    projectKey: project?.key ?? null,
    projectName: project?.name ?? null,
    projectIcon: project?.icon ?? null,
    assigneeId: task.assigneeId ?? null,
  });
}

async function loadAttentionTasks(
  client: BacksterosApiClient,
  signal: AbortSignal,
): Promise<ApiTask[]> {
  const results = await Promise.all(
    ATTENTION_STATUSES.map(async (status) => {
      const query = new URLSearchParams({ status });
      const result = await client.requestJson<{ tasks: ApiTask[] }>(
        `/api/v1/tasks?${query.toString()}`,
        { signal },
      );
      return result.tasks;
    }),
  );
  const byId = new Map<string, ApiTask>();
  for (const task of results.flat()) {
    byId.set(task.id, task);
  }
  return [...byId.values()].sort((a, b) => {
    const aMs = Date.parse(a.updatedAt) || 0;
    const bMs = Date.parse(b.updatedAt) || 0;
    return bMs - aMs;
  });
}

type AttentionInboxContextValue = {
  items: InboxListItem[];
  rawTasks: ApiTask[];
  loading: boolean;
  patchTask: (
    taskId: string,
    patch: Record<string, unknown>,
  ) => Promise<ApiTask>;
  holdTaskForAgent: (
    taskId: string,
    decision: AgentHoldDecision,
    options?: { force?: boolean },
  ) => Promise<void>;
  applyLocalStatus: (taskId: string, status: TaskStatus) => void;
};

const AttentionInboxContext = createContext<AttentionInboxContextValue | null>(
  null,
);

function useAttentionInbox(): AttentionInboxContextValue {
  const value = useContext(AttentionInboxContext);
  if (!value) {
    throw new Error(
      "Attention inbox components must be used within AttentionInboxProvider",
    );
  }
  return value;
}

export function AttentionInboxProvider({
  projectsById,
  projectsReady = true,
  pathname,
  onSelectedTaskMeta,
  onActivityFeedInvalidate,
  agentStatusHandlersRef,
  children,
}: {
  projectsById: Map<string, ApiProject>;
  /** False while codebase projects are still loading — avoids an empty flash. */
  projectsReady?: boolean;
  pathname?: string;
  onSelectedTaskMeta?: (
    task: { id: string; title: string; projectId: string | null } | null,
  ) => void;
  /** Soft-reload comments/activities only — must not remount the inbox list. */
  onActivityFeedInvalidate?: () => void;
  /**
   * Ref filled with handlers so the terminal can advance status in place
   * (without wiping the attention list / remounting the agent session).
   */
  agentStatusHandlersRef?: MutableRefObject<{
    onBecameWorking: (taskId: string) => void;
    onBecameIdle: (taskId: string) => void;
    onBecameAttention: (taskId: string) => void;
    onNeedsHold: (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { parentCommentId?: string | null },
    ) => void;
    onNeedsReview?: (taskId: string) => void;
  } | null>;
  children: ReactNode;
}) {
  const { client } = useConsoleApi();
  const load = useCallback(
    (api: typeof client, signal: AbortSignal) => loadAttentionTasks(api, signal),
    [],
  );
  // Identity deps must stay empty: bumping a revision here clears `data` in
  // useApiResource and nulls selection → terminal remount (feels like a refresh).
  const { data, loading: tasksLoading, setData } = useApiResource(load, []);

  const rawTasks = useMemo(() => {
    if (!projectsReady) return [];
    return (data ?? []).filter(
      (task) =>
        Boolean(task.projectId) && projectsById.has(task.projectId as string),
    );
  }, [data, projectsById, projectsReady]);

  const items = useMemo(
    () =>
      sortInboxItemsByAttentionStatus(
        rawTasks.map((task) => mapAttentionItem(task, projectsById)),
      ),
    [projectsById, rawTasks],
  );

  const loading = tasksLoading || !projectsReady;

  // Resolve selection as soon as list data is ready so the terminal column
  // can open without waiting on the detail pane mount.
  useEffect(() => {
    if (!onSelectedTaskMeta || !pathname) return;
    const slug = pathname.match(/^\/inbox\/([^/]+)/)?.[1];
    if (!slug) {
      onSelectedTaskMeta(null);
      return;
    }
    const item = findInboxItemBySlugOrId(items, decodeURIComponent(slug));
    if (!item || item.kind !== "task") {
      // Keep prior selection while the list is still loading so a soft
      // revalidate never tears down the terminal mid-turn.
      if (loading) return;
      onSelectedTaskMeta(null);
      return;
    }
    const raw = rawTasks.find((task) => task.id === item.id);
    onSelectedTaskMeta({
      id: item.id,
      title: item.title,
      projectId: raw?.projectId ?? item.projectId ?? null,
    });
  }, [items, loading, onSelectedTaskMeta, pathname, rawTasks]);

  const patchTask = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      const updated = await client.requestJson<ApiTask>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      setData((current) => {
        if (!current) return current;
        const status = migrateLegacyTaskStatus(updated.status);
        if (!(ATTENTION_STATUSES as readonly string[]).includes(status)) {
          return current.filter((task) => task.id !== taskId);
        }
        // Drop tasks that left the codebase project set.
        if (
          !updated.projectId ||
          !projectsById.has(updated.projectId)
        ) {
          return current.filter((task) => task.id !== taskId);
        }
        return current.map((task) => (task.id === taskId ? updated : task));
      });
      return updated;
    },
    [client, projectsById, setData],
  );

  const holdingTaskIdsRef = useRef(new Set<string>());

  const applyLocalStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      setData((current) => {
        if (!current) return current;
        if (!(ATTENTION_STATUSES as readonly string[]).includes(status)) {
          return current.filter((task) => task.id !== taskId);
        }
        return current.map((task) =>
          task.id === taskId ? { ...task, status } : task,
        );
      });
    },
    [setData],
  );

  const holdTaskForAgent = useCallback(
    async (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { force?: boolean; parentCommentId?: string | null },
    ) => {
      if (holdingTaskIdsRef.current.has(taskId)) return;
      holdingTaskIdsRef.current.add(taskId);
      try {
        const ok = await holdTaskForAgentRequest(
          client,
          taskId,
          decision,
          options,
        );
        if (!ok) return;
        applyLocalStatus(taskId, "on_hold");
        onActivityFeedInvalidate?.();
      } finally {
        holdingTaskIdsRef.current.delete(taskId);
      }
    },
    [applyLocalStatus, client, onActivityFeedInvalidate],
  );

  const handleAgentBecameWorking = useCallback(
    (taskId: string) => {
      // API write happens in console-shell; only refresh the attention list.
      applyLocalStatus(taskId, "in_progress");
    },
    [applyLocalStatus],
  );

  const handleAgentBecameIdle = useCallback((_taskId: string) => {
    /* Status stays as-is when the agent finishes a turn (unless hold fires). */
  }, []);

  const handleAgentBecameAttention = useCallback((_taskId: string) => {
    /* Permission prompts stay In Progress — only unresolved needs-input holds. */
  }, []);

  const handleAgentNeedsHold = useCallback(
    (
      taskId: string,
      decision: AgentHoldDecision,
      options?: { parentCommentId?: string | null },
    ) => {
      void holdTaskForAgent(taskId, decision, options);
    },
    [holdTaskForAgent],
  );

  const handleAgentNeedsReview = useCallback(
    (taskId: string) => {
      applyLocalStatus(taskId, "in_review");
      onActivityFeedInvalidate?.();
    },
    [applyLocalStatus, onActivityFeedInvalidate],
  );

  useEffect(() => {
    if (!agentStatusHandlersRef) return;
    agentStatusHandlersRef.current = {
      onBecameWorking: handleAgentBecameWorking,
      onBecameIdle: handleAgentBecameIdle,
      onBecameAttention: handleAgentBecameAttention,
      onNeedsHold: handleAgentNeedsHold,
      onNeedsReview: handleAgentNeedsReview,
    };
    return () => {
      agentStatusHandlersRef.current = null;
    };
  }, [
    agentStatusHandlersRef,
    handleAgentBecameAttention,
    handleAgentBecameIdle,
    handleAgentBecameWorking,
    handleAgentNeedsHold,
    handleAgentNeedsReview,
  ]);

  const value = useMemo(
    () => ({
      items,
      rawTasks,
      loading,
      patchTask,
      holdTaskForAgent,
      applyLocalStatus,
    }),
    [
      applyLocalStatus,
      holdTaskForAgent,
      items,
      loading,
      patchTask,
      rawTasks,
    ],
  );

  return (
    <AttentionInboxContext.Provider value={value}>
      {children}
    </AttentionInboxContext.Provider>
  );
}

export function InboxAttentionList({
  pathname,
  Link,
  onNavigate,
  workingTaskIds = [],
}: {
  pathname: string;
  Link: InboxListItemLinkComponent;
  onNavigate?: (href: string) => void;
  workingTaskIds?: readonly string[];
}) {
  const { client } = useConsoleApi();
  const { items, loading, patchTask } = useAttentionInbox();
  const autoSelectDoneRef = useRef(false);
  const workingTaskIdSet = useMemo(
    () => new Set(workingTaskIds),
    [workingTaskIds],
  );

  const loadContacts = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const result = await api.requestJson<{ contacts: ApiContact[] }>(
        "/api/v1/contacts",
        { signal },
      );
      return result.contacts ?? [];
    },
    [],
  );
  const { data: contacts } = useApiResource(loadContacts, []);
  const contactAvatarSrc = useConsoleAvatarSrcMap("contact", contacts ?? []);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(
          (contacts ?? []).map((contact) => ({
            id: contact.id,
            name: contact.name?.trim() || "Untitled",
            email: contact.email,
            avatarStorageKey: contact.avatarStorageKey,
            updatedAt: contact.updatedAt,
          })),
          contactAvatarSrc,
        ),
      ),
    [contactAvatarSrc, contacts],
  );

  useEffect(() => {
    if (!onNavigate || loading) return;
    const slug = pathname.match(/^\/inbox\/([^/]+)/)?.[1];
    if (slug) {
      autoSelectDoneRef.current = false;
      return;
    }
    if (autoSelectDoneRef.current) return;
    if (items.length === 0) return;
    const first = getFirstInboxItemHref(items);
    if (!first) return;
    autoSelectDoneRef.current = true;
    onNavigate(first);
  }, [items, loading, onNavigate, pathname]);

  return (
    <InboxSidePanelView
      pathname={pathname}
      items={items}
      Link={Link}
      loading={loading}
      emptyLabel="No tasks need your attention."
      groupByAttentionStatus
      assigneeOptions={assigneeOptions}
      renderTitleTrailing={(item) =>
        item.kind === "task" && workingTaskIdSet.has(item.id) ? (
          <DotScrollLoader
            className="task-sync-loader"
            aria-label="Agent working"
          />
        ) : null
      }
      onPriorityChange={(taskId, priority) => {
        void patchTask(taskId, { priority });
      }}
      onDueDateChange={(taskId, dueDate) => {
        void patchTask(taskId, {
          dueDate: dueDate ? dueDate.toISOString() : null,
        });
      }}
      onAssigneeChange={(taskId, assigneeId) => {
        void patchTask(taskId, { assigneeId });
      }}
    />
  );
}

export function InboxAttentionDetail({
  pathname,
  projectsById,
  feedRevision,
  workingTaskIds,
  agentOpenTaskIds,
  terminalCollapsed = false,
  onToggleTerminal,
  onAttachAgentSession,
  onEndAgentSession,
  onActivityFeedInvalidate,
  onNavigate,
}: {
  pathname: string;
  projectsById: Map<string, ApiProject>;
  feedRevision: number;
  workingTaskIds: readonly string[];
  agentOpenTaskIds: readonly string[];
  terminalCollapsed?: boolean;
  onToggleTerminal?: () => void;
  onAttachAgentSession: (request: AgentAttachRequest) => void;
  onEndAgentSession: (request: AgentEndRequest) => void;
  onActivityFeedInvalidate: () => void;
  onNavigate?: (href: string) => void;
}): ReactNode {
  const { client } = useConsoleApi();
  const {
    items,
    rawTasks,
    loading,
    patchTask,
    holdTaskForAgent,
    applyLocalStatus,
  } = useAttentionInbox();

  const slug = pathname.match(/^\/inbox\/([^/]+)/)?.[1] ?? null;
  const selectedItem = slug
    ? (findInboxItemBySlugOrId(items, decodeURIComponent(slug)) ?? null)
    : null;
  const selectedRaw =
    selectedItem?.kind === "task"
      ? (rawTasks.find((task) => task.id === selectedItem.id) ?? null)
      : null;

  // Selection left the attention set (e.g. Completed) — jump to next or inbox root.
  useEffect(() => {
    if (loading) return;
    if (!slug) return;
    if (selectedItem) return;
    if (items.length === 0) {
      onNavigate?.("/inbox");
      return;
    }
    const first = getFirstInboxItemHref(items);
    if (first) onNavigate?.(first);
  }, [items, loading, onNavigate, selectedItem, slug]);

  const loadContacts = useCallback(
    async (api: typeof client, signal: AbortSignal) => {
      const result = await api.requestJson<{ contacts: ApiContact[] }>(
        "/api/v1/contacts",
        { signal },
      );
      return result.contacts ?? [];
    },
    [],
  );
  const { data: contacts } = useApiResource(loadContacts, []);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        (contacts ?? []).map((contact) => ({
          id: contact.id,
          name: contact.name,
          email: contact.email,
        })),
      ),
    [contacts],
  );

  const projectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        [...projectsById.values()].map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
        })),
        { includeNone: false },
      ),
    [projectsById],
  );

  const patchAndInvalidate = useCallback(
    async (taskId: string, patch: Record<string, unknown>) => {
      const updated = await patchTask(taskId, patch);
      onActivityFeedInvalidate();
      return updated;
    },
    [onActivityFeedInvalidate, patchTask],
  );

  if (loading && !selectedRaw) {
    return (
      <aside className="console-pane">
        <div className="console-pane-header">
          <div className="console-pane-header-title">
            <span>Inbox</span>
          </div>
        </div>
        <div className="console-pane-body">
          <InboxDetailLayout item={null} resolving />
        </div>
      </aside>
    );
  }

  if (!selectedItem || !selectedRaw) {
    return (
      <aside className="console-pane">
        <div className="console-pane-header">
          <div className="console-pane-header-title">
            <span>Inbox</span>
          </div>
        </div>
        <div className="console-pane-body">
          <InboxDetailLayout item={null} />
        </div>
      </aside>
    );
  }

  const detail = mapApiTaskDetail(selectedRaw, projectsById);
  const working = workingTaskIds.includes(selectedRaw.id);
  const headerTitle = detail.displayId?.trim() || "Task";

  return (
    <aside className="console-pane">
      <div className="console-pane-header">
        <div className="console-pane-header-title">
          <span>{headerTitle}</span>
        </div>
        <div className="console-pane-header-actions">
          {onToggleTerminal ? (
            <button
              type="button"
              className="console-icon-btn"
              onClick={onToggleTerminal}
              title={
                terminalCollapsed
                  ? "Show terminal"
                  : "Hide terminal — expand task"
              }
              aria-label={
                terminalCollapsed
                  ? "Show terminal"
                  : "Hide terminal and expand task"
              }
              aria-pressed={terminalCollapsed}
            >
              <ProjectsSidePanelIcon collapsed={terminalCollapsed} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="console-pane-body">
        <div className="task-panel-island task-panel-island--detail">
          <TaskStackedDetailView
            task={detail}
            showDisplayId={false}
            projectOptions={projectOptions}
            assigneeOptions={assigneeOptions}
            onStatusChange={(next) => {
              void patchAndInvalidate(selectedRaw.id, {
                status: next as TaskStatus,
              });
            }}
            onPriorityChange={(next) => {
              void patchAndInvalidate(selectedRaw.id, { priority: next });
            }}
            onDueDateChange={(next) => {
              void patchAndInvalidate(selectedRaw.id, {
                dueDate: next ? next.toISOString() : null,
              });
            }}
            onAssigneeChange={(next) => {
              void patchAndInvalidate(selectedRaw.id, { assigneeId: next });
            }}
            onProjectChange={(next) => {
              const nextProject = next
                ? [...projectsById.values()].find(
                    (entry) => entry.key === next,
                  ) ?? null
                : null;
              void patchAndInvalidate(selectedRaw.id, {
                projectId: nextProject?.id ?? null,
              });
            }}
            onSaveDescription={(description) => {
              void patchAndInvalidate(selectedRaw.id, { description });
            }}
            onSaveTitle={async (title) => {
              const trimmed = title.trim();
              if (!trimmed) {
                return { ok: false as const, error: "Task title is required." };
              }
              try {
                await patchAndInvalidate(selectedRaw.id, { title: trimmed });
                return { ok: true as const };
              } catch (error) {
                return {
                  ok: false as const,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Could not rename task.",
                };
              }
            }}
            belowDescription={
              <TaskActivityPanel
                taskId={selectedRaw.id}
                taskUpdatedAt={selectedRaw.updatedAt}
                feedRevision={feedRevision}
                working={working}
                agentOpenInTerminal={
                  !terminalCollapsed &&
                  agentOpenTaskIds.includes(selectedRaw.id)
                }
                taskSummary={{
                  number: selectedRaw.number,
                  title: selectedRaw.title,
                  description: selectedRaw.description,
                  projectKey: detail.projectKey,
                  projectId: selectedRaw.projectId,
                  workingDirectory: selectedRaw.projectId
                    ? (projectsById.get(selectedRaw.projectId)
                        ?.localWorkingDirectory ?? null)
                    : null,
                }}
                onAttachSession={(session, options) => {
                  onAttachAgentSession({
                    taskId: session.taskId,
                    chatId: session.chatId,
                    prompt: options?.prompt,
                    focusUi: options?.focusUi,
                    sessionIsNew: options?.sessionIsNew,
                    forceReattach: options?.forceReattach,
                    replyParentCommentId: options?.replyParentCommentId,
                  });
                }}
                onEndSession={(session: TaskAgentSession) => {
                  onEndAgentSession({
                    taskId: session.taskId,
                    chatId: session.chatId,
                  });
                }}
                onMarkInProgress={async () => {
                  await patchAndInvalidate(selectedRaw.id, {
                    status: "in_progress",
                    activityActor: "agent",
                  });
                }}
                onLaunchFailed={(error) =>
                  void holdTaskForAgent(
                    selectedRaw.id,
                    buildLaunchFailedHold(error),
                    { force: true },
                  )
                }
                onSimulateLaunchFail={() =>
                  void holdTaskForAgent(
                    selectedRaw.id,
                    buildLaunchFailedHold(
                      "Simulated launch failure (agent testing mode).",
                    ),
                    { force: true },
                  )
                }
                onSimulateNeedsInput={() =>
                  void holdTaskForAgent(
                    selectedRaw.id,
                    {
                      kind: "needs_input",
                      commentBody: formatAgentHoldComment(
                        "needs_input",
                        "Simulated needs-input hold (agent testing mode). Reply to continue.",
                      ),
                    },
                    { force: true },
                  )
                }
                onSimulateReadyForReview={() =>
                  reviewTaskForAgent(
                    client,
                    selectedRaw.id,
                    "Simulated ready-for-review (agent testing mode).",
                    { force: true },
                  ).then((ok) => {
                    if (!ok) return;
                    applyLocalStatus(selectedRaw.id, "in_review");
                    onActivityFeedInvalidate();
                  })
                }
              />
            }
          />
        </div>
      </div>
    </aside>
  );
}
