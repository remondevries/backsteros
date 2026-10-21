import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildAssigneeDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskRelatedDropdownOptions,
  CommandPaletteProvider,
  ListKeyboardNavigationProvider,
  ProjectTasksView,
  taskReorderPatches,
  useTaskPropertyDropdownShortcuts,
  type TaskItemRowTask,
  type TaskReorderRequest,
  type TaskStatus,
} from "@backsteros/ui";

import {
  createTask,
  deleteTask,
  fetchContacts,
  fetchOrganizations,
  fetchProjectTasks,
  fetchProjects,
  patchTask,
  readCoreConfig,
  resolveProjectByPenpotId,
  type ApiContact,
  type ApiOrganization,
  type ApiProject,
  type CoreConfig,
} from "./core-api.js";
import {
  FilesKeyboardZone,
  type DesignFileNavItem,
} from "./files-keyboard-zone.js";
import { mapTask } from "./map-task.js";
import {
  consumePendingOpenPinnedTask,
  getPinnedTaskIds,
  OPEN_PINNED_TASK,
  PINNED_TASKS_CHANGED,
  togglePinnedTask,
  toPinnedSnap,
} from "./pinned-tasks-store.js";
import { TaskDetailPane } from "./task-detail-pane.js";
import { useAvatarSrcMap, withAvatarSrc } from "./use-avatar-src-map.js";

/** `stack` = list OR detail (workspace). `rail` = list + adjacent detail (overview). */
export type ProjectTasksLayout = "stack" | "rail";

export type { DesignFileNavItem };

function filterTasks(
  tasks: TaskItemRowTask[],
  query: string,
): TaskItemRowTask[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tasks;
  return tasks.filter((task) => {
    const displayId =
      task.projectKey != null
        ? `${task.projectKey}-${task.number}`
        : String(task.number);
    return (
      task.title.toLowerCase().includes(needle) ||
      displayId.toLowerCase().includes(needle) ||
      String(task.number).includes(needle) ||
      (task.status ?? "").toLowerCase().includes(needle) ||
      (task.projectKey ?? "").toLowerCase().includes(needle)
    );
  });
}

function TasksSearchIcon() {
  return (
    <svg
      className="backsteros-project-tasks__search-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 10.5L14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TasksSearchHeader({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <header className="backsteros-project-tasks__header">
      <label className="backsteros-project-tasks__search">
        <TasksSearchIcon />
        <input
          type="search"
          className="backsteros-project-tasks__search-input"
          placeholder="Search tasks…"
          aria-label="Search tasks"
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </header>
  );
}

export type ProjectTasksAppProps = {
  penpotProjectId: string;
  layout?: ProjectTasksLayout;
  /** Open task from the dashboard URL (`?task-id=`). */
  taskId?: string | null;
  /** Keep the dashboard URL in sync when selecting / closing a task. */
  onTaskIdChange?: (taskId: string | null) => void;
  /** Penpot files in this project — content-zone j/k + Tab from tasks. */
  files?: DesignFileNavItem[];
  onOpenFile?: (fileId: string) => void;
};

type PropertyCatalog = {
  contacts: ApiContact[];
  organizations: ApiOrganization[];
  projects: ApiProject[];
};

type ReadyState = {
  kind: "ready";
  config: CoreConfig;
  project: ApiProject;
  tasks: TaskItemRowTask[];
  catalog: PropertyCatalog;
};

const CHROME_CHANNEL = "backsterdesign-desktop";

type ChromeTimerFocus = {
  taskId: string;
  title: string;
  number: number | null;
  projectKey: string | null;
  status: string | null;
  trackedDurationSeconds: number | null;
};

/** Tell the Tauri chrome which task the header timer should show. */
function postChromeTimerFocus(focus: ChromeTimerFocus | null): void {
  const msg = {
    channel: CHROME_CHANNEL,
    type: "timer-focus",
    taskId: focus?.taskId ?? null,
    title: focus?.title ?? null,
    number: focus?.number ?? null,
    projectKey: focus?.projectKey ?? null,
    status: focus?.status ?? null,
    trackedDurationSeconds: focus?.trackedDurationSeconds ?? null,
  };
  const tauri = (
    window as unknown as {
      __TAURI__?: { event?: { emit?: (event: string, payload: unknown) => Promise<void> } };
    }
  ).__TAURI__;
  const emit = tauri?.event?.emit;
  if (typeof emit === "function") {
    void emit("bd-from-spa", msg).catch(() => {});
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(msg, "*");
  }
}

const emptyCatalog = (): PropertyCatalog => ({
  contacts: [],
  organizations: [],
  projects: [],
});

type LoadState =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "unlinked" }
  | { kind: "error"; message: string }
  | ReadyState;

/** Survive SPA remounts when switching pinned dashboard ↔ file tabs. */
const readyCache = new Map<string, Omit<ReadyState, "kind">>();

function readReadyCache(penpotProjectId: string): ReadyState | null {
  const hit = readyCache.get(penpotProjectId);
  if (!hit) return null;
  return {
    kind: "ready",
    ...hit,
    catalog: hit.catalog ?? emptyCatalog(),
  };
}

function writeReadyCache(
  penpotProjectId: string,
  entry: Omit<ReadyState, "kind">,
): void {
  readyCache.set(penpotProjectId, {
    ...entry,
    catalog: entry.catalog ?? emptyCatalog(),
  });
}

function readCachedCatalog(penpotProjectId: string): PropertyCatalog {
  return readyCache.get(penpotProjectId)?.catalog ?? emptyCatalog();
}

function railSeenKey(penpotProjectId: string): string {
  return `bd-tasks-rail-seen:${penpotProjectId}`;
}

function hasSeenRail(penpotProjectId: string): boolean {
  try {
    return sessionStorage.getItem(railSeenKey(penpotProjectId)) === "1";
  } catch {
    return false;
  }
}

function markRailSeen(penpotProjectId: string): void {
  try {
    sessionStorage.setItem(railSeenKey(penpotProjectId), "1");
  } catch {
    /* private mode / quota — ignore */
  }
}

function normalizeTaskId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function initialLoadState(penpotProjectId: string): LoadState {
  return readReadyCache(penpotProjectId) ?? { kind: "loading" };
}

/**
 * Must render under {@link CommandPaletteProvider} — same S/P/A/⇧D/… chords as
 * BacksterOS desktop and BacksterDev task detail.
 */
function TaskPropertyDropdownHotkeys({ enabled }: { enabled: boolean }) {
  useTaskPropertyDropdownShortcuts({ enabled });
  return null;
}

export function ProjectTasksApp({
  penpotProjectId,
  layout = "stack",
  taskId = null,
  onTaskIdChange,
  files = [],
  onOpenFile,
}: ProjectTasksAppProps) {
  const initialTaskId = normalizeTaskId(taskId);
  const cachedReady = readReadyCache(penpotProjectId);
  const alreadyLoaded = cachedReady != null || hasSeenRail(penpotProjectId);

  const [state, setState] = useState<LoadState>(() =>
    initialLoadState(penpotProjectId),
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    () => initialTaskId,
  );
  const [taskQuery, setTaskQuery] = useState("");
  /** Pinning is workspace (file editor) only — stack layout, not dashboard rail. */
  const pinEnabled = layout === "stack";
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    pinEnabled ? getPinnedTaskIds(penpotProjectId) : new Set(),
  );
  const isRail = layout === "rail";

  // Restore path: columns start at their final width — no width transition.
  // Cold first load: list starts closed; motion is opted in only for that open.
  const [listOpen, setListOpen] = useState(
    () => isRail && (alreadyLoaded || initialTaskId != null),
  );
  const [listMotion, setListMotion] = useState(false);
  const [detailMotion, setDetailMotion] = useState(false);

  const onTaskIdChangeRef = useRef(onTaskIdChange);
  onTaskIdChangeRef.current = onTaskIdChange;
  const playedIntroRef = useRef(alreadyLoaded || initialTaskId != null);

  const reload = useCallback(async () => {
    const config = readCoreConfig();
    if (!config) {
      setState({ kind: "unconfigured" });
      return;
    }
    try {
      const project = await resolveProjectByPenpotId(config, penpotProjectId);
      if (!project) {
        setState({ kind: "unlinked" });
        return;
      }
      const [rows, contacts, organizations, projects] = await Promise.all([
        fetchProjectTasks(config, project.id),
        fetchContacts(config).catch(() => readCachedCatalog(penpotProjectId).contacts),
        fetchOrganizations(config).catch(
          () => readCachedCatalog(penpotProjectId).organizations,
        ),
        fetchProjects(config).catch(() =>
          readCachedCatalog(penpotProjectId).projects.length > 0
            ? readCachedCatalog(penpotProjectId).projects
            : [project],
        ),
      ]);
      const catalog: PropertyCatalog = {
        contacts,
        organizations,
        projects: projects.length > 0 ? projects : [project],
      };
      const ready = {
        config,
        project,
        tasks: rows.map((row) => mapTask(row, project)),
        catalog,
      };
      writeReadyCache(penpotProjectId, ready);
      setState({ kind: "ready", ...ready });
    } catch (err) {
      setState((current) => {
        // Keep showing cached data on background refresh failure.
        if (current.kind === "ready") return current;
        return {
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      });
    }
  }, [penpotProjectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // URL / host props are the source of truth for the open task.
  useEffect(() => {
    setSelectedTaskId(normalizeTaskId(taskId));
  }, [taskId, penpotProjectId]);

  const selectTask = useCallback((nextId: string | null) => {
    // User-driven open/close — allow the detail width transition.
    setDetailMotion(true);
    const normalized = normalizeTaskId(nextId);
    setSelectedTaskId(normalized);
    onTaskIdChangeRef.current?.(normalized);
  }, []);

  useEffect(() => {
    if (!pinEnabled) {
      setPinnedIds(new Set());
      return;
    }
    setPinnedIds(getPinnedTaskIds(penpotProjectId));
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ penpotProjectId?: string }>)
        .detail;
      if (
        detail?.penpotProjectId &&
        detail.penpotProjectId !== penpotProjectId
      ) {
        return;
      }
      setPinnedIds(getPinnedTaskIds(penpotProjectId));
    };
    window.addEventListener(PINNED_TASKS_CHANGED, onChanged);
    return () => window.removeEventListener(PINNED_TASKS_CHANGED, onChanged);
  }, [pinEnabled, penpotProjectId]);

  useEffect(() => {
    if (!pinEnabled) return;
    const pending = consumePendingOpenPinnedTask();
    if (pending) selectTask(pending);
    const onOpen = (event: Event) => {
      const taskId = (event as CustomEvent<{ taskId?: string }>).detail
        ?.taskId;
      if (typeof taskId === "string" && taskId) {
        selectTask(taskId);
      }
    };
    window.addEventListener(OPEN_PINNED_TASK, onOpen);
    return () => window.removeEventListener(OPEN_PINNED_TASK, onOpen);
  }, [pinEnabled, selectTask]);

  const onTogglePin = useCallback(
    (task: TaskItemRowTask) => {
      if (!pinEnabled) return;
      togglePinnedTask(penpotProjectId, toPinnedSnap(task));
    },
    [pinEnabled, penpotProjectId],
  );

  const patchLocal = useCallback(
    (id: string, patch: Partial<TaskItemRowTask>) => {
      setState((current) => {
        if (current.kind !== "ready") return current;
        const next = {
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === id ? { ...task, ...patch } : task,
          ),
        };
        writeReadyCache(penpotProjectId, {
          config: next.config,
          project: next.project,
          tasks: next.tasks,
          catalog: next.catalog,
        });
        return next;
      });
    },
    [penpotProjectId],
  );

  const removeLocal = useCallback(
    (ids: readonly string[]) => {
      const remove = new Set(ids);
      setState((current) => {
        if (current.kind !== "ready") return current;
        const next = {
          ...current,
          tasks: current.tasks.filter((task) => !remove.has(task.id)),
        };
        writeReadyCache(penpotProjectId, {
          config: next.config,
          project: next.project,
          tasks: next.tasks,
          catalog: next.catalog,
        });
        return next;
      });
      setSelectedTaskId((current) => {
        if (!current || !remove.has(current)) return current;
        onTaskIdChangeRef.current?.(null);
        return null;
      });
    },
    [penpotProjectId],
  );

  const catalog =
    state.kind === "ready" ? state.catalog : emptyCatalog();
  const coreConfig = state.kind === "ready" ? state.config : null;
  const contactAvatarSrc = useAvatarSrcMap(
    coreConfig,
    "contact",
    catalog.contacts,
  );
  const organizationAvatarSrc = useAvatarSrcMap(
    coreConfig,
    "organization",
    catalog.organizations,
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(catalog.contacts, { avatarSrcById: contactAvatarSrc }),
    [catalog.contacts, contactAvatarSrc],
  );

  const relatedOptions = useMemo(
    () =>
      buildTaskRelatedDropdownOptions({
        contactOptions: assigneeOptions,
        organizationOptions: buildOrganizationDropdownOptions(
          withAvatarSrc(catalog.organizations, organizationAvatarSrc),
          { includeNone: false },
        ),
      }),
    [assigneeOptions, catalog.organizations, organizationAvatarSrc],
  );

  const projectOptions = useMemo(() => {
    // Design is scoped to the linked Penpot project — only expose that row so
    // the chip gets a real status icon / label without offering a move.
    const current =
      state.kind === "ready"
        ? (catalog.projects.find((entry) => entry.id === state.project.id) ??
          state.project)
        : null;
    if (!current) return [];
    return buildProjectDropdownOptions(
      [
        {
          key: current.key,
          name: current.name,
          icon: current.icon,
          type: current.type,
          status: current.status,
        },
      ],
      { includeNone: false, includeClosed: true },
    );
  }, [catalog.projects, state]);

  const onStatusChange = useCallback(
    (id: string, status: TaskStatus) => {
      if (state.kind !== "ready") return;
      patchLocal(id, { status });
      void patchTask(state.config, id, { status }).catch(() => {
        void reload();
      });
    },
    [patchLocal, reload, state],
  );

  const onPriorityChange = useCallback(
    (id: string, priority: number) => {
      if (state.kind !== "ready") return;
      patchLocal(id, { priority });
      void patchTask(state.config, id, { priority }).catch(() => {
        void reload();
      });
    },
    [patchLocal, reload, state],
  );

  const onDueDateChange = useCallback(
    (id: string, dueDate: Date | null) => {
      if (state.kind !== "ready") return;
      patchLocal(id, {
        dueDate: dueDate ? dueDate.getTime() : null,
      });
      void patchTask(state.config, id, {
        dueDate: dueDate ? dueDate.toISOString() : null,
      }).catch(() => {
        void reload();
      });
    },
    [patchLocal, reload, state],
  );

  const onAssigneeChange = useCallback(
    (id: string, assigneeId: string | null) => {
      if (state.kind !== "ready") return;
      const contact = assigneeId
        ? state.catalog.contacts.find((entry) => entry.id === assigneeId)
        : null;
      patchLocal(id, {
        assigneeId,
        ownerInitials: contact?.name?.trim() || null,
      });
      void patchTask(state.config, id, { assigneeId }).catch(() => {
        void reload();
      });
    },
    [patchLocal, reload, state],
  );

  const onCreateTask = useCallback(
    async (input: { status: TaskStatus; title: string }) => {
      if (state.kind !== "ready") return;
      const created = await createTask(state.config, {
        projectId: state.project.id,
        title: input.title,
        status: input.status,
      });
      await reload();
      return { id: created.id };
    },
    [reload, state],
  );

  const onCreatedTask = useCallback(
    (taskId: string) => {
      selectTask(taskId);
    },
    [selectTask],
  );

  const onDeleteTask = useCallback(
    async (task: TaskItemRowTask) => {
      if (state.kind !== "ready") {
        return { ok: false as const, error: "Tasks are not ready." };
      }
      try {
        await deleteTask(state.config, task.id);
        removeLocal([task.id]);
        return { ok: true as const };
      } catch (error) {
        void reload();
        return {
          ok: false as const,
          error:
            error instanceof Error ? error.message : "Failed to delete task.",
        };
      }
    },
    [reload, removeLocal, state],
  );

  const onBulkDelete = useCallback(
    async (taskIds: string[]) => {
      if (state.kind !== "ready" || taskIds.length === 0) return;
      const deleted: string[] = [];
      for (const taskId of taskIds) {
        try {
          await deleteTask(state.config, taskId);
          deleted.push(taskId);
        } catch {
          // Keep going — remaining ids may still delete.
        }
      }
      if (deleted.length > 0) removeLocal(deleted);
      if (deleted.length < taskIds.length) void reload();
    },
    [reload, removeLocal, state],
  );

  const onReorder = useCallback(
    (request: TaskReorderRequest) => {
      if (state.kind !== "ready") return;
      const patches = taskReorderPatches(state.tasks, request);
      for (const patch of patches) {
        patchLocal(patch.id, {
          status: patch.status,
          sortOrder: patch.sortOrder,
        });
        void patchTask(state.config, patch.id, {
          status: patch.status,
          sortOrder: patch.sortOrder,
        }).catch(() => {
          void reload();
        });
      }
    },
    [patchLocal, reload, state],
  );

  const selectedListTask = useMemo(() => {
    if (state.kind !== "ready" || !selectedTaskId) return null;
    return state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [selectedTaskId, state]);

  useEffect(() => {
    if (state.kind !== "ready" || !selectedListTask) return;
    postChromeTimerFocus({
      taskId: selectedListTask.id,
      title: selectedListTask.title,
      number: selectedListTask.number,
      projectKey: selectedListTask.projectKey ?? state.project.key,
      status: selectedListTask.status,
      trackedDurationSeconds: selectedListTask.trackedDurationSeconds ?? null,
    });
  }, [selectedListTask, state]);

  // Detail column is open whenever a task id is selected (incl. URL restore
  // while data is still refreshing) so we never animate 0 → open on remount.
  const showingDetail = selectedTaskId != null;
  const detailReady =
    state.kind === "ready" && selectedTaskId != null;

  /** Stack mode replaces the list; rail keeps the list and opens a 2nd column. */
  const replaceWithDetail = detailReady && !isRail;

  // Cold first load only: animate the list open once data has settled.
  // Cached / previously-seen rails stay open with motion off.
  useEffect(() => {
    if (!isRail) {
      setListOpen(false);
      setListMotion(false);
      return;
    }

    if (playedIntroRef.current || hasSeenRail(penpotProjectId)) {
      markRailSeen(penpotProjectId);
      setListOpen(true);
      setListMotion(false);
      playedIntroRef.current = true;
      return;
    }

    if (state.kind === "loading") {
      setListOpen(false);
      setListMotion(false);
      return;
    }

    // First settle after a cold load — opt into CSS transition, then open.
    let cancelled = false;
    setListMotion(true);
    const outer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        markRailSeen(penpotProjectId);
        playedIntroRef.current = true;
        setListOpen(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [isRail, penpotProjectId, state.kind]);

  let statusBody: ReactNode = null;
  // Don't flash "Loading…" when we already have cached tasks on screen.
  if (state.kind === "loading" && !cachedReady) {
    statusBody = (
      <p className="backsteros-project-tasks__loading">Loading tasks…</p>
    );
  } else if (state.kind === "unconfigured") {
    statusBody = (
      <p className="backsteros-project-tasks__error">
        Configure window.backsterosCore to load BacksterOS tasks.
      </p>
    );
  } else if (state.kind === "unlinked") {
    statusBody = (
      <p className="backsteros-project-tasks__empty">
        No BacksterOS project linked to this Penpot project.
      </p>
    );
  } else if (state.kind === "error") {
    statusBody = (
      <p className="backsteros-project-tasks__error">
        Could not load tasks: {state.message}
      </p>
    );
  }

  const visibleTasks =
    state.kind === "ready"
      ? filterTasks(state.tasks, taskQuery).filter(
          (task) => !(pinEnabled && pinnedIds.has(task.id)),
        )
      : [];

  const listPane =
    state.kind === "ready" && !replaceWithDetail ? (
      <ProjectTasksView
        tasks={visibleTasks}
        listItemVariant="card"
        selectedTaskId={selectedTaskId}
        onSelectTask={selectTask}
        onStatusChange={onStatusChange}
        onPriorityChange={onPriorityChange}
        onDueDateChange={onDueDateChange}
        onAssigneeChange={onAssigneeChange}
        assigneeOptions={assigneeOptions}
        onCreateTask={onCreateTask}
        onCreatedTask={onCreatedTask}
        onDeleteTask={onDeleteTask}
        onBulkDelete={onBulkDelete}
        onReorder={onReorder}
        showPin={pinEnabled}
        pinnedTaskIds={pinnedIds}
        onTogglePin={pinEnabled ? onTogglePin : undefined}
      />
    ) : null;

  const detailPane =
    detailReady && selectedTaskId && state.kind === "ready" ? (
      <TaskDetailPane
        config={state.config}
        project={state.project}
        taskId={selectedTaskId}
        listTask={selectedListTask}
        contacts={state.catalog.contacts}
        contactAvatarSrc={contactAvatarSrc}
        assigneeOptions={assigneeOptions}
        relatedOptions={relatedOptions}
        projectOptions={projectOptions}
        onBack={() => selectTask(null)}
        onTaskPatched={patchLocal}
        onTaskDeleted={() => {
          removeLocal([selectedTaskId]);
        }}
        pinEnabled={pinEnabled}
        pinned={
          pinEnabled && selectedTaskId
            ? pinnedIds.has(selectedTaskId)
            : false
        }
        onTogglePin={
          pinEnabled && selectedListTask
            ? () => onTogglePin(selectedListTask)
            : undefined
        }
      />
    ) : showingDetail && state.kind === "loading" ? (
      <p className="backsteros-project-tasks__loading">Loading task…</p>
    ) : null;

  return (
    <CommandPaletteProvider>
      <TaskPropertyDropdownHotkeys enabled={state.kind === "ready"} />
      <ListKeyboardNavigationProvider
        pathname={`/design/projects/${penpotProjectId}`}
      >
        <section
          className={[
            "backsteros-project-tasks",
            "bos-product-shell",
            isRail ? "backsteros-project-tasks--rail" : null,
            replaceWithDetail ? "backsteros-project-tasks--detail" : null,
            showingDetail && isRail
              ? "backsteros-project-tasks--rail-open"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="backsteros-project-tasks"
          data-list-item-variant="card"
          data-layout={layout}
          data-view={showingDetail ? "detail" : "list"}
        >
          {isRail ? (
            <>
              <div
                className={[
                  "backsteros-project-tasks__list-col",
                  listOpen ? "backsteros-project-tasks__list-col--open" : null,
                  listMotion ? "backsteros-project-tasks__col--motion" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden={!listOpen}
                data-open={listOpen ? "true" : "false"}
              >
                <div className="backsteros-project-tasks__list-col-inner">
                  {statusBody ? (
                    <div className="backsteros-project-tasks__body">
                      {statusBody}
                    </div>
                  ) : (
                    <>
                      <TasksSearchHeader
                        value={taskQuery}
                        onChange={setTaskQuery}
                      />
                      <div className="backsteros-project-tasks__list-scroll">
                        {listPane}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div
                className={[
                  "backsteros-project-tasks__detail-col",
                  showingDetail
                    ? "backsteros-project-tasks__detail-col--open"
                    : null,
                  detailMotion
                    ? "backsteros-project-tasks__col--motion"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden={!showingDetail}
                data-open={showingDetail ? "true" : "false"}
              >
                <div className="backsteros-project-tasks__detail-col-inner">
                  {detailPane}
                </div>
              </div>
            </>
          ) : statusBody ? (
            <div className="backsteros-project-tasks__body">{statusBody}</div>
          ) : replaceWithDetail ? (
            <div className="backsteros-project-tasks__body">{detailPane}</div>
          ) : (
            <>
              <TasksSearchHeader
                value={taskQuery}
                onChange={setTaskQuery}
              />
              <div className="backsteros-project-tasks__body">{listPane}</div>
            </>
          )}
        </section>
        {isRail ? (
          <FilesKeyboardZone files={files} onOpenFile={onOpenFile} />
        ) : null}
      </ListKeyboardNavigationProvider>
    </CommandPaletteProvider>
  );
}
