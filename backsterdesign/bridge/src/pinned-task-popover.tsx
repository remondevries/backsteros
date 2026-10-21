import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  buildAssigneeDropdownOptions,
  buildOrganizationDropdownOptions,
  buildProjectDropdownOptions,
  buildTaskRelatedDropdownOptions,
  getProjectTaskHref,
  getTaskDisplayId,
  TaskActivityPanel,
  TaskDetailView,
  TrackedTimeField,
  type TaskDetailViewTask,
  type TaskRelatedSelection,
  type TaskStatus,
} from "@backsteros/ui";

import {
  createCoreRequestJson,
  fetchContacts,
  fetchOrganizations,
  fetchProjects,
  fetchTask,
  patchTask,
  postTaskTimerActivity,
  readCoreConfig,
  type ApiContact,
  type ApiOrganization,
  type ApiProject,
  type ApiTask,
  type ApiTaskLink,
  type CoreConfig,
} from "./core-api.js";
import { mapTask } from "./map-task.js";
import {
  updatePinnedTaskSnap,
  type PinnedTaskSnap,
} from "./pinned-tasks-store.js";
import { useAvatarSrcMap, withAvatarSrc } from "./use-avatar-src-map.js";

export type PinnedTaskPopoverProps = {
  task: PinnedTaskSnap;
  penpotProjectId: string;
  anchorEl: HTMLElement;
  onClose: () => void;
  onOpenInPanel?: (taskId: string) => void;
};

type PopoverPos = {
  top: number;
  left: number;
};

type PopoverSize = {
  width: number;
  /** null = grow with content up to the viewport. */
  height: number | null;
};

type PopoverSession = {
  pos: PopoverPos;
  size: PopoverSize;
  /** After drag/resize/task-switch, stop re-anchoring to the dock row. */
  pinned: boolean;
};

type ResizeEdge = "e" | "s" | "se";

const POPOVER_DEFAULT_WIDTH = 420;
const POPOVER_MIN_WIDTH = 320;
const POPOVER_MIN_HEIGHT = 180;
const POPOVER_GAP = 8;
const VIEWPORT_PAD = 8;

/** Keeps placement/size across task switches for the open popover session. */
let popoverSession: PopoverSession | null = null;

export function clearPinnedTaskPopoverSession(): void {
  popoverSession = null;
}

function parseTaskLinks(value: unknown): ApiTaskLink[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ApiTaskLink =>
      item != null &&
      typeof item === "object" &&
      typeof (item as { id?: unknown }).id === "string" &&
      typeof (item as { url?: unknown }).url === "string" &&
      typeof (item as { createdAt?: unknown }).createdAt === "string",
  );
}

function maxPopoverWidth(): number {
  return Math.max(
    POPOVER_MIN_WIDTH,
    window.innerWidth - VIEWPORT_PAD * 2,
  );
}

function maxPopoverHeight(): number {
  return Math.max(
    POPOVER_MIN_HEIGHT,
    window.innerHeight - VIEWPORT_PAD * 2,
  );
}

function clampSize(size: PopoverSize): PopoverSize {
  const width = Math.min(
    maxPopoverWidth(),
    Math.max(POPOVER_MIN_WIDTH, Math.round(size.width)),
  );
  if (size.height == null) return { width, height: null };
  return {
    width,
    height: Math.min(
      maxPopoverHeight(),
      Math.max(POPOVER_MIN_HEIGHT, Math.round(size.height)),
    ),
  };
}

function computePosition(
  anchor: HTMLElement,
  height: number,
  width: number,
): PopoverPos {
  const rect = anchor.getBoundingClientRect();
  let left = rect.right + POPOVER_GAP;
  if (left + width > window.innerWidth - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, rect.left - width - POPOVER_GAP);
  }
  let top = rect.top;
  if (top + height > window.innerHeight - VIEWPORT_PAD) {
    top = Math.max(VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD - height);
  }
  if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
  return { top, left };
}

function clampPosition(
  pos: PopoverPos,
  height: number,
  width: number,
): PopoverPos {
  const maxLeft = Math.max(
    VIEWPORT_PAD,
    window.innerWidth - VIEWPORT_PAD - width,
  );
  const maxTop = Math.max(
    VIEWPORT_PAD,
    window.innerHeight - VIEWPORT_PAD - height,
  );
  return {
    left: Math.min(maxLeft, Math.max(VIEWPORT_PAD, pos.left)),
    top: Math.min(maxTop, Math.max(VIEWPORT_PAD, pos.top)),
  };
}

function isPopoverDragHandleTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".backsteros-pinned-task-popover__header-end")) {
    return false;
  }
  if (target.closest("[data-popover-resize]")) return false;
  return Boolean(target.closest(".backsteros-pinned-task-popover__header"));
}

function writeSession(next: PopoverSession): void {
  popoverSession = next;
}

function ExpandPanelIcon() {
  return (
    <svg
      width="14"
      height="14"
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M14 3.25a.75.75 0 0 0-.75.75l2.845 2.845L13.47 9.47a.75.75 0 1 0 1.06 1.06l2.625-2.625L20 10.75a.75.75 0 0 0 .75-.75V4a.75.75 0 0 0-.75-.75zm-10 10a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h6a.75.75 0 0 0 .75-.75l-2.845-2.845 2.625-2.625a.75.75 0 1 0-1.06-1.06l-2.625 2.625z" />
    </svg>
  );
}

function resolveAssigneeName(
  assigneeId: string | null | undefined,
  apiName: string | null | undefined,
  contacts: readonly ApiContact[],
): string | null {
  if (assigneeId) {
    const contact = contacts.find((entry) => entry.id === assigneeId);
    if (contact?.name?.trim()) return contact.name.trim();
  }
  return apiName?.trim() || null;
}

function toDetailTask(
  api: ApiTask | null,
  snap: PinnedTaskSnap,
  contacts: readonly ApiContact[],
  project: ApiProject | null,
): TaskDetailViewTask {
  const fallback: ApiTask = {
    id: snap.id,
    title: snap.title,
    status: snap.status,
    priority: snap.priority,
    projectId: snap.projectId,
    number: snap.number,
  };
  const source = api ?? fallback;
  const mapped = mapTask(source, project);
  const assigneeId = mapped.assigneeId ?? null;
  const displayId = getTaskDisplayId(
    {
      number: mapped.number,
      projectId: mapped.projectId,
      projectKey: mapped.projectKey ?? snap.projectKey,
      contactId: mapped.contactId,
    },
    project?.key ?? snap.projectKey,
  );
  return {
    id: mapped.id,
    title: mapped.title,
    description: source.description ?? null,
    displayId,
    links: parseTaskLinks(source.links),
    status: mapped.status,
    priority: mapped.priority,
    dueDate: mapped.dueDate,
    dueEndDate: mapped.dueEndDate,
    assigneeId,
    assigneeName: resolveAssigneeName(
      assigneeId,
      source.assigneeName,
      contacts,
    ),
    contactId: mapped.contactId ?? null,
    relatedContactIds: mapped.relatedContactIds ?? [],
    relatedOrganizationIds: mapped.relatedOrganizationIds ?? [],
    linkedEmailIds: mapped.linkedEmailIds ?? [],
    labelIds: mapped.labelIds ?? [],
    projectKey: mapped.projectKey ?? snap.projectKey,
    projectName: mapped.projectName ?? project?.name ?? snap.projectKey,
    agentCreatedAt: mapped.agentCreatedAt ?? null,
    agentInboxApprovedAt: mapped.agentInboxApprovedAt ?? null,
    trackedMinutes: mapped.trackedMinutes ?? null,
    trackedDurationSeconds: mapped.trackedDurationSeconds ?? null,
    support: mapped.support ?? false,
    notification: mapped.notification ?? false,
  };
}

export function PinnedTaskPopover({
  task,
  penpotProjectId,
  anchorEl,
  onClose,
  onOpenInPanel,
}: PinnedTaskPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPos>(() => {
    if (popoverSession) return popoverSession.pos;
    return computePosition(anchorEl, 180, POPOVER_DEFAULT_WIDTH);
  });
  const [size, setSize] = useState<PopoverSize>(() => {
    if (popoverSession) return popoverSession.size;
    return { width: POPOVER_DEFAULT_WIDTH, height: null };
  });
  const [pinned, setPinned] = useState(() => popoverSession?.pinned ?? false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    edge: ResizeEdge;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const pinnedRef = useRef(pinned);
  const sizeRef = useRef(size);
  const posRef = useRef(pos);
  pinnedRef.current = pinned;
  sizeRef.current = size;
  posRef.current = pos;

  const [detail, setDetail] = useState<ApiTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configRef = useRef<CoreConfig | null>(readCoreConfig());
  const [config, setConfig] = useState<CoreConfig | null>(() =>
    readCoreConfig(),
  );
  const [contacts, setContacts] = useState<ApiContact[]>([]);
  const [organizations, setOrganizations] = useState<ApiOrganization[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);

  const requestJson = useMemo(
    () => (config ? createCoreRequestJson(config) : null),
    [config],
  );
  const activityCurrentUser = useMemo(
    () => ({ email: null as string | null, imageUrl: null as string | null }),
    [],
  );

  const contactAvatarSrc = useAvatarSrcMap(config, "contact", contacts);
  const organizationAvatarSrc = useAvatarSrcMap(
    config,
    "organization",
    organizations,
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(contacts, { avatarSrcById: contactAvatarSrc }),
    [contacts, contactAvatarSrc],
  );

  const relatedOptions = useMemo(
    () =>
      buildTaskRelatedDropdownOptions({
        contactOptions: assigneeOptions,
        organizationOptions: buildOrganizationDropdownOptions(
          withAvatarSrc(organizations, organizationAvatarSrc),
        ),
      }),
    [assigneeOptions, organizations, organizationAvatarSrc],
  );

  const project = useMemo(() => {
    const projectId = detail?.projectId ?? task.projectId;
    if (projectId) {
      const byId = projects.find((entry) => entry.id === projectId);
      if (byId) return byId;
    }
    if (task.projectKey) {
      return projects.find((entry) => entry.key === task.projectKey) ?? null;
    }
    return null;
  }, [detail?.projectId, projects, task.projectId, task.projectKey]);

  const projectOptions = useMemo(() => {
    if (!project) return [];
    return buildProjectDropdownOptions(
      [
        {
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
          status: project.status,
        },
      ],
      { includeNone: false, includeClosed: true },
    );
  }, [project]);

  const detailTask = useMemo(
    () => toDetailTask(detail, task, contacts, project),
    [contacts, detail, project, task],
  );

  const prevTaskIdRef = useRef(task.id);

  const persistSession = useCallback(
    (next: Partial<PopoverSession> & { pos?: PopoverPos; size?: PopoverSize }) => {
      const session: PopoverSession = {
        pos: next.pos ?? posRef.current,
        size: next.size ?? sizeRef.current,
        pinned: next.pinned ?? pinnedRef.current,
      };
      writeSession(session);
      posRef.current = session.pos;
      sizeRef.current = session.size;
      pinnedRef.current = session.pinned;
    },
    [],
  );

  const syncDockSnap = useCallback(
    (patch: Partial<Omit<PinnedTaskSnap, "id">>) => {
      updatePinnedTaskSnap(penpotProjectId, task.id, patch);
    },
    [penpotProjectId, task.id],
  );

  // Lock placement/size before the anchoring layout effect when switching pins.
  useLayoutEffect(() => {
    if (prevTaskIdRef.current === task.id) return;
    prevTaskIdRef.current = task.id;
    pinnedRef.current = true;
    setPinned(true);
    setDragging(false);
    setResizing(false);
    dragRef.current = null;
    resizeRef.current = null;
    persistSession({ pinned: true });
  }, [task.id, persistSession]);

  useEffect(() => {
    const next = readCoreConfig();
    configRef.current = next;
    setConfig(next);
    if (!next) {
      setLoading(false);
      setError("BacksterOS core is not connected.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    void fetchTask(next, task.id)
      .then((row) => {
        if (cancelled) return;
        setDetail(row);
        setLoading(false);
        syncDockSnap({
          title: row.title,
          status: row.status,
          priority: row.priority ?? 0,
          projectId: row.projectId ?? task.projectId,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load task details.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [syncDockSnap, task.id, task.projectId]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    void Promise.all([
      fetchContacts(config).catch(() => [] as ApiContact[]),
      fetchOrganizations(config).catch(() => [] as ApiOrganization[]),
      fetchProjects(config).catch(() => [] as ApiProject[]),
    ]).then(([nextContacts, nextOrgs, nextProjects]) => {
      if (cancelled) return;
      setContacts(nextContacts);
      setOrganizations(nextOrgs);
      setProjects(nextProjects);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const place = () => {
      const measured = panel.getBoundingClientRect();
      const width = sizeRef.current.width;
      const height = sizeRef.current.height ?? (measured.height || 180);
      if (pinnedRef.current) {
        const nextPos = clampPosition(posRef.current, height, width);
        const nextSize = clampSize(sizeRef.current);
        setPos(nextPos);
        setSize(nextSize);
        persistSession({ pos: nextPos, size: nextSize, pinned: true });
        return;
      }
      const nextPos = computePosition(anchorEl, height, width);
      setPos(nextPos);
      persistSession({ pos: nextPos, pinned: false });
    };
    place();
    const onScrollOrResize = () => place();
    window.addEventListener("resize", onScrollOrResize);
    const scrollRoot = anchorEl.closest(
      ".backsteros-pinned-tasks-dock, .backsteros-pinned-tasks-host, #left-sidebar-aside",
    );
    scrollRoot?.addEventListener("scroll", onScrollOrResize, true);
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => place())
        : null;
    resizeObserver?.observe(panel);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      scrollRoot?.removeEventListener("scroll", onScrollOrResize, true);
      resizeObserver?.disconnect();
    };
  }, [anchorEl, detail, loading, error, pinned, persistSession]);

  const onDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      if (!isPopoverDragHandleTarget(event.target)) return;
      const panel = panelRef.current;
      if (!panel) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      dragRef.current = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };
      pinnedRef.current = true;
      setPinned(true);
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const onDragPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const panel = panelRef.current;
      const height =
        sizeRef.current.height ??
        panel?.getBoundingClientRect().height ??
        180;
      const nextPos = clampPosition(
        {
          left: event.clientX - drag.offsetX,
          top: event.clientY - drag.offsetY,
        },
        height,
        sizeRef.current.width,
      );
      setPos(nextPos);
      persistSession({ pos: nextPos, pinned: true });
    },
    [persistSession],
  );

  const onDragPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
    },
    [],
  );

  const onResizePointerDown = useCallback(
    (edge: ResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      resizeRef.current = {
        pointerId: event.pointerId,
        edge,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
      };
      pinnedRef.current = true;
      setPinned(true);
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const onResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      let width = drag.startWidth;
      let height: number | null = sizeRef.current.height;
      if (drag.edge === "e" || drag.edge === "se") width = drag.startWidth + dx;
      if (drag.edge === "s" || drag.edge === "se") {
        height = drag.startHeight + dy;
      }
      const nextSize = clampSize({ width, height });
      const nextPos = clampPosition(
        posRef.current,
        nextSize.height ?? drag.startHeight,
        nextSize.width,
      );
      setSize(nextSize);
      setPos(nextPos);
      persistSession({ pos: nextPos, size: nextSize, pinned: true });
    },
    [persistSession],
  );

  const onResizePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      resizeRef.current = null;
      setResizing(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
    },
    [],
  );

  const handleClose = useCallback(() => {
    clearPinnedTaskPopoverSession();
    onClose();
  }, [onClose]);

  const handleExpandToPanel = useCallback(() => {
    if (!onOpenInPanel) return;
    onOpenInPanel(task.id);
    handleClose();
  }, [handleClose, onOpenInPanel, task.id]);

  const applyPatch = useCallback(
    async (
      apiPatch: Record<string, unknown>,
      localPatch: Partial<ApiTask> = {},
      snapPatch?: Partial<Omit<PinnedTaskSnap, "id">>,
    ) => {
      const cfg = configRef.current ?? readCoreConfig();
      if (!cfg) return;
      setDetail((current) =>
        current ? { ...current, ...localPatch } : current,
      );
      if (snapPatch) syncDockSnap(snapPatch);
      try {
        await patchTask(cfg, task.id, apiPatch);
      } catch {
        // Keep optimistic value; reopen to refresh from server if needed.
      }
    },
    [syncDockSnap, task.id],
  );

  const applyTrackedSeconds = useCallback(
    async (seconds: number | null) => {
      const trackedMinutes =
        seconds != null && seconds >= 60 ? Math.floor(seconds / 60) : null;
      await applyPatch(
        { trackedDurationSeconds: seconds, trackedMinutes },
        { trackedDurationSeconds: seconds, trackedMinutes },
      );
    },
    [applyPatch],
  );

  const onTimerSessionChange = useCallback(
    async (action: "start" | "pause", seconds?: number | null) => {
      const cfg = configRef.current ?? readCoreConfig();
      if (!cfg) return;
      try {
        await postTaskTimerActivity(cfg, task.id, action, seconds);
      } catch {
        // best-effort
      }
    },
    [task.id],
  );

  const displayId =
    detailTask.displayId ??
    (task.projectKey
      ? `${task.projectKey}-${task.number}`
      : `#${task.number}`);
  const timerSession = useMemo(() => {
    if (detailTask.support) return null;
    const projectKey =
      detailTask.projectKey?.trim() || task.projectKey?.trim() || null;
    const number = task.number;
    const href =
      projectKey && number != null
        ? getProjectTaskHref(projectKey, number)
        : `/tasks/${encodeURIComponent(task.id)}`;
    return {
      kind: "task" as const,
      entityId: task.id,
      title: detailTask.title?.trim() || displayId || "Task",
      subtitle: displayId,
      statusKey: detailTask.status,
      href,
    };
  }, [
    detailTask.projectKey,
    detailTask.status,
    detailTask.support,
    detailTask.title,
    displayId,
    task.id,
    task.number,
    task.projectKey,
  ]);
  const showTimer = !loading && !error && !detailTask.support;
  const showDetail = !loading && !error;

  return createPortal(
    <div
      ref={panelRef}
      className={[
        "backsteros-pinned-task-popover bos-product-shell",
        dragging ? "backsteros-pinned-task-popover--dragging" : null,
        resizing ? "backsteros-pinned-task-popover--resizing" : null,
        size.height != null
          ? "backsteros-pinned-task-popover--sized"
          : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-pinned-task-popover=""
      role="dialog"
      aria-label={detailTask.title}
      style={{
        top: pos.top,
        left: pos.left,
        width: size.width,
        ...(size.height != null ? { height: size.height } : null),
      }}
    >
      <header
        className="backsteros-pinned-task-popover__header"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <span className="backsteros-pinned-task-popover__id">
          {displayId}
        </span>
        <div className="backsteros-pinned-task-popover__header-end">
          {showTimer ? (
            <div className="backsteros-pinned-task-popover__timer">
              <TrackedTimeField
                variant="pill"
                trackedDurationSeconds={
                  detailTask.trackedDurationSeconds ?? null
                }
                trackedMinutes={detailTask.trackedMinutes ?? null}
                onTrackedDurationSecondsChange={(seconds) => {
                  void applyTrackedSeconds(seconds);
                }}
                onTimerSessionChange={(action, seconds) => {
                  void onTimerSessionChange(action, seconds);
                }}
                timerSession={timerSession}
              />
            </div>
          ) : null}
          {onOpenInPanel ? (
            <button
              type="button"
              className="backsteros-pinned-task-popover__expand"
              aria-label="Open in tasks panel"
              title="Open in tasks panel"
              onClick={handleExpandToPanel}
            >
              <ExpandPanelIcon />
            </button>
          ) : null}
          <button
            type="button"
            className="backsteros-pinned-task-popover__close"
            aria-label="Close"
            onClick={handleClose}
          >
            ×
          </button>
        </div>
      </header>
      {loading ? (
        <p className="backsteros-pinned-task-popover__hint">Loading…</p>
      ) : error ? (
        <p className="backsteros-pinned-task-popover__hint" role="alert">
          {error}
        </p>
      ) : showDetail ? (
        <div className="backsteros-pinned-task-popover__detail">
          <TaskDetailView
            task={detailTask}
            sectionLabel="Tasks"
            showDisplayId={false}
            showNarrowTimer={false}
            copyIdShortcutEnabled={false}
            onSaveTitle={async (title) => {
              const next = title.trim();
              if (!next) return { ok: false, error: "Title is required." };
              await applyPatch(
                { title: next },
                { title: next },
                { title: next },
              );
              return { ok: true };
            }}
            onSaveDescription={async (value) => {
              const description = value.trim() || null;
              await applyPatch({ description }, { description });
            }}
            onChangeLinks={(links) => {
              void applyPatch({ links }, { links });
            }}
            designPublicUri={
              typeof window !== "undefined"
                ? window.location.origin
                : "https://localhost:3449"
            }
            onStatusChange={(status: TaskStatus) => {
              void applyPatch({ status }, { status }, { status });
            }}
            onPriorityChange={(priority) => {
              void applyPatch(
                { priority },
                { priority },
                { priority },
              );
            }}
            onDueDateChange={(dueDate) => {
              void applyPatch(
                { dueDate: dueDate ? dueDate.toISOString() : null },
                {
                  dueDate: dueDate ? dueDate.toISOString() : null,
                },
              );
            }}
            onAssigneeChange={(assigneeId) => {
              const assigneeName = resolveAssigneeName(
                assigneeId,
                null,
                contacts,
              );
              void applyPatch(
                { assigneeId },
                { assigneeId, assigneeName },
              );
            }}
            onRelatedChange={(related: TaskRelatedSelection) => {
              void applyPatch(
                {
                  relatedContactIds: related.contactIds,
                  relatedOrganizationIds: related.organizationIds,
                  linkedEmailIds: related.emailIds,
                },
                {
                  relatedContactIds: related.contactIds,
                  relatedOrganizationIds: related.organizationIds,
                  linkedEmailIds: related.emailIds,
                },
              );
            }}
            onProjectChange={() => {
              // Design is scoped to the linked Penpot project — keep fixed.
            }}
            assigneeOptions={assigneeOptions}
            relatedOptions={relatedOptions}
            projectOptions={projectOptions}
            onTrackedDurationSecondsChange={(seconds) => {
              void applyTrackedSeconds(seconds);
            }}
            onTimerSessionChange={(action, seconds) => {
              void onTimerSessionChange(action, seconds);
            }}
            timerSession={timerSession}
            belowDescription={
              requestJson ? (
                <TaskActivityPanel
                  taskId={task.id}
                  taskUpdatedAt={detail?.updatedAt ?? null}
                  requestJson={requestJson}
                  currentUser={activityCurrentUser}
                />
              ) : null
            }
          />
        </div>
      ) : null}
      <div
        className="backsteros-pinned-task-popover__resize backsteros-pinned-task-popover__resize--e"
        data-popover-resize="e"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize width"
        title="Drag to resize"
        onPointerDown={onResizePointerDown("e")}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
      <div
        className="backsteros-pinned-task-popover__resize backsteros-pinned-task-popover__resize--s"
        data-popover-resize="s"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize height"
        title="Drag to resize"
        onPointerDown={onResizePointerDown("s")}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
      <div
        className="backsteros-pinned-task-popover__resize backsteros-pinned-task-popover__resize--se"
        data-popover-resize="se"
        role="separator"
        aria-label="Resize"
        title="Drag to resize"
        onPointerDown={onResizePointerDown("se")}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
    </div>,
    document.body,
  );
}
