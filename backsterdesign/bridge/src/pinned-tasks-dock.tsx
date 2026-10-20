import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { getTaskDisplayId } from "@backsteros/ui";

import { PinnedTaskPopover } from "./pinned-task-popover.js";
import {
  clampPinnedDockHeight,
  getPinnedDockHeight,
  getPinnedTasks,
  isPinnedDockCollapsed,
  PINNED_TASKS_CHANGED,
  reorderPinnedTasks,
  requestOpenPinnedTask,
  setPinnedDockCollapsed,
  setPinnedDockHeight,
  unpinTask,
  type PinnedTaskSnap,
} from "./pinned-tasks-store.js";

export type PinnedTasksDockProps = {
  penpotProjectId: string;
  /** Opens the workspace tasks panel and selects the task (from popover). */
  onOpenTask?: (taskId: string) => void;
};

const REORDER_THRESHOLD_PX = 5;

type ReorderDragSession = {
  taskId: string;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
};

function PinGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14.102 2.664c.628-.416 1.692-.713 2.495.09l4.647 4.648c.806.804.508 1.868.091 2.495a2.95 2.95 0 0 1-.863.85c-.334.213-.756.374-1.211.35a9 9 0 0 1-.658-.071l-.068-.01a9 9 0 0 0-.707-.073c-.504-.025-.698.06-.76.12l-2.49 2.491c-.08.08-.18.258-.256.6-.073.33-.105.736-.113 1.186-.007.432.008.874.024 1.3l.001.047c.015.423.03.855.009 1.194-.065 1.031-.868 1.79-1.658 2.141-.79.35-1.917.437-2.7-.347l-2.25-2.25L3.53 21.53a.75.75 0 1 1-1.06-1.06l4.104-4.105-2.25-2.25c-.783-.784-.697-1.91-.346-2.7.35-.79 1.11-1.593 2.14-1.658.34-.021.772-.006 1.195.009l.047.001c.426.015.868.031 1.3.024.45-.008.856-.04 1.186-.113.342-.076.52-.177.6-.257l2.49-2.49c.061-.061.146-.256.12-.76a9 9 0 0 0-.073-.707l-.009-.068a9 9 0 0 1-.071-.658c-.025-.455.136-.877.348-1.211.216-.34.515-.64.851-.863" />
    </svg>
  );
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden="true"
      className="backsteros-pinned-tasks-dock__chevron"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4.5 9.5 8 6 11.5"
      />
    </svg>
  );
}

function reorderTasksByPointerY(
  tasks: PinnedTaskSnap[],
  dragId: string,
  clientY: number,
  listEl: HTMLElement,
): PinnedTaskSnap[] {
  const dragged = tasks.find((task) => task.id === dragId);
  if (!dragged) return tasks;

  const others = tasks.filter((task) => task.id !== dragId);
  const itemEls = Array.from(
    listEl.querySelectorAll<HTMLElement>("[data-pinned-task-id]"),
  ).filter((el) => el.dataset.pinnedTaskId !== dragId);

  let insertAt = others.length;
  for (let index = 0; index < itemEls.length; index += 1) {
    const rect = itemEls[index]!.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      insertAt = index;
      break;
    }
  }

  const next = [...others];
  next.splice(insertAt, 0, dragged);
  if (
    next.length === tasks.length &&
    next.every((task, index) => task.id === tasks[index]?.id)
  ) {
    return tasks;
  }
  return next;
}

export function PinnedTasksDock({
  penpotProjectId,
  onOpenTask,
}: PinnedTasksDockProps) {
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [tasks, setTasks] = useState<PinnedTaskSnap[]>(() =>
    getPinnedTasks(penpotProjectId),
  );
  const [collapsed, setCollapsed] = useState(() =>
    isPinnedDockCollapsed(penpotProjectId),
  );
  const [height, setHeight] = useState(() =>
    getPinnedDockHeight(penpotProjectId),
  );
  const [resizing, setResizing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const anchorRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const reorderDragRef = useRef<ReorderDragSession | null>(null);
  const suppressOpenClickRef = useRef(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    setTasks(getPinnedTasks(penpotProjectId));
    setCollapsed(isPinnedDockCollapsed(penpotProjectId));
    setHeight(getPinnedDockHeight(penpotProjectId));
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ penpotProjectId?: string }>).detail;
      if (detail?.penpotProjectId && detail.penpotProjectId !== penpotProjectId) {
        return;
      }
      // Ignore store echoes while the user is mid-drag (we already mirror locally).
      if (reorderDragRef.current?.active) return;
      const next = getPinnedTasks(penpotProjectId);
      setTasks(next);
      setOpenTaskId((current) =>
        current && next.some((row) => row.id === current) ? current : null,
      );
    };
    window.addEventListener(PINNED_TASKS_CHANGED, onChanged);
    return () => window.removeEventListener(PINNED_TASKS_CHANGED, onChanged);
  }, [penpotProjectId]);

  useLayoutEffect(() => {
    const host = rootRef.current?.closest(
      ".backsteros-pinned-tasks-host",
    ) as HTMLElement | null;
    if (!host) return;
    if (collapsed || tasks.length === 0) {
      host.style.height = "";
      host.style.maxHeight = "";
      return () => {
        host.style.height = "";
        host.style.maxHeight = "";
      };
    }
    host.style.height = `${height}px`;
    host.style.maxHeight = `${height}px`;
    return () => {
      host.style.height = "";
      host.style.maxHeight = "";
    };
  }, [collapsed, height, tasks.length]);

  // Penpot button styles force `cursor: pointer` — pin grabbing on <body>
  // so it stays correct while the pointer moves across other rows.
  useEffect(() => {
    if (!draggingId) return;
    const { body } = document;
    body.classList.add("backsteros-pinned-tasks-reordering");
    return () => {
      body.classList.remove("backsteros-pinned-tasks-reordering");
    };
  }, [draggingId]);

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      event.preventDefault();
      const target = event.currentTarget;
      resizeDragRef.current = { startY: event.clientY, startHeight: height };
      setResizing(true);
      target.setPointerCapture(event.pointerId);
    },
    [collapsed, height],
  );

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // Dragging the top edge up grows the panel; down shrinks it.
      const next = clampPinnedDockHeight(
        drag.startHeight + (drag.startY - event.clientY),
      );
      setHeight(next);
    },
    [],
  );

  const onResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizeDragRef.current) return;
      resizeDragRef.current = null;
      setResizing(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      setHeight((current) => {
        const next = clampPinnedDockHeight(current);
        setPinnedDockHeight(penpotProjectId, next);
        return next;
      });
    },
    [penpotProjectId],
  );

  const endReorderDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
      const session = reorderDragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      reorderDragRef.current = null;
      setDraggingId(null);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // already released
      }
      if (session.active && commit) {
        suppressOpenClickRef.current = true;
        reorderPinnedTasks(
          penpotProjectId,
          tasksRef.current.map((task) => task.id),
        );
      }
    },
    [penpotProjectId],
  );

  const onItemPointerDown = useCallback(
    (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      if (tasksRef.current.length < 2) return;
      reorderDragRef.current = {
        taskId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
      suppressOpenClickRef.current = false;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    },
    [],
  );

  const onItemPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const session = reorderDragRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.active) {
        if (Math.hypot(dx, dy) < REORDER_THRESHOLD_PX) return;
        session.active = true;
        setDraggingId(session.taskId);
      }
      const listEl = listRef.current;
      if (!listEl) return;
      event.preventDefault();
      setTasks((current) =>
        reorderTasksByPointerY(current, session.taskId, event.clientY, listEl),
      );
    },
    [],
  );

  const onItemPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      endReorderDrag(event, true);
    },
    [endReorderDrag],
  );

  const onItemPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      // Restore order from storage if the gesture was cancelled mid-drag.
      const session = reorderDragRef.current;
      if (session?.active) {
        setTasks(getPinnedTasks(penpotProjectId));
      }
      endReorderDrag(event, false);
    },
    [endReorderDrag, penpotProjectId],
  );

  if (tasks.length === 0) {
    return null;
  }

  const openTask =
    !collapsed && openTaskId
      ? (tasks.find((row) => row.id === openTaskId) ?? null)
      : null;
  const openAnchor =
    openTaskId != null ? (anchorRefs.current.get(openTaskId) ?? null) : null;

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      setPinnedDockCollapsed(penpotProjectId, next);
      if (next) setOpenTaskId(null);
      return next;
    });
  };

  return (
    <section
      ref={rootRef}
      className={[
        "backsteros-pinned-tasks-dock",
        collapsed ? "backsteros-pinned-tasks-dock--collapsed" : null,
        resizing ? "backsteros-pinned-tasks-dock--resizing" : null,
        draggingId ? "backsteros-pinned-tasks-dock--reordering" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="backsteros-pinned-tasks-dock"
      aria-label="Tasks"
      style={collapsed ? undefined : { height }}
    >
      {!collapsed ? (
        <div
          className="backsteros-pinned-tasks-dock__resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize tasks panel"
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      ) : null}
      <header className="backsteros-pinned-tasks-dock__header">
        <button
          type="button"
          className="backsteros-pinned-tasks-dock__toggle"
          aria-expanded={!collapsed}
          aria-controls="backsteros-pinned-tasks-list"
          title={collapsed ? "Expand tasks" : "Collapse tasks"}
          onClick={toggleCollapsed}
        >
          <CollapseChevron collapsed={collapsed} />
          <span className="backsteros-pinned-tasks-dock__title">Tasks</span>
        </button>
        <span className="backsteros-pinned-tasks-dock__count">{tasks.length}</span>
      </header>
      {collapsed ? null : (
        <ul
          ref={listRef}
          id="backsteros-pinned-tasks-list"
          className="backsteros-pinned-tasks-dock__list"
        >
          {tasks.map((task) => {
            const displayId = getTaskDisplayId(
              {
                number: task.number,
                projectId: task.projectId,
                projectKey: task.projectKey,
              },
              task.projectKey,
            );
            const expanded = openTaskId === task.id;
            const dragging = draggingId === task.id;
            return (
              <li
                key={task.id}
                className={[
                  "backsteros-pinned-tasks-dock__item",
                  dragging
                    ? "backsteros-pinned-tasks-dock__item--dragging"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-pinned-task-id={task.id}
              >
                <button
                  type="button"
                  className={[
                    "backsteros-pinned-tasks-dock__open",
                    expanded
                      ? "backsteros-pinned-tasks-dock__open--active"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={
                    tasks.length > 1
                      ? `${task.title} — drag to reorder`
                      : task.title
                  }
                  aria-expanded={expanded}
                  aria-haspopup="dialog"
                  ref={(node) => {
                    if (node) anchorRefs.current.set(task.id, node);
                    else anchorRefs.current.delete(task.id);
                  }}
                  onPointerDown={(event) => onItemPointerDown(task.id, event)}
                  onPointerMove={onItemPointerMove}
                  onPointerUp={onItemPointerUp}
                  onPointerCancel={onItemPointerCancel}
                  onClick={() => {
                    if (suppressOpenClickRef.current) {
                      suppressOpenClickRef.current = false;
                      return;
                    }
                    // Stay open until the popover × is pressed; switching pins
                    // swaps the open card so canvas work is not interrupted.
                    setOpenTaskId(task.id);
                  }}
                >
                  <span className="backsteros-pinned-tasks-dock__id">
                    {displayId ?? `#${task.number}`}
                  </span>
                  <span className="backsteros-pinned-tasks-dock__name">
                    {task.title}
                  </span>
                </button>
                <button
                  type="button"
                  className="backsteros-pinned-tasks-dock__unpin"
                  aria-label={`Unpin ${task.title}`}
                  title="Unpin"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => unpinTask(penpotProjectId, task.id)}
                >
                  <PinGlyph />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {openTask && openAnchor ? (
        <PinnedTaskPopover
          task={openTask}
          penpotProjectId={penpotProjectId}
          anchorEl={openAnchor}
          onClose={() => setOpenTaskId(null)}
          onOpenInPanel={
            onOpenTask
              ? (taskId) => {
                  onOpenTask(taskId);
                  window.setTimeout(() => {
                    requestOpenPinnedTask(taskId);
                  }, 80);
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
