import { useCallback, useEffect, useRef, useState } from "react";

import { formatBacksterosActivityRelativeTime } from "~/backsteros/activityTime";
import { fetchBacksterosTaskActivities } from "~/backsteros/client";
import { getBacksterosTaskPriorityLabel } from "~/backsteros/taskDetailFormat";
import {
  getBacksterosTaskStatusLabel,
  isBacksterosTaskStatus,
  migrateBacksterosTaskStatus,
} from "~/backsteros/taskStatus";
import type { BacksterosTask, BacksterosTaskActivity } from "~/backsteros/types";
import "~/backsteros/backsterosActivity.css";

/** Matches desktop `CodebaseProjectActivityPanel`: show 5, load 5 more, up to 20. */
const ACTIVITY_PAGE_SIZE = 5;
const ACTIVITY_MAX_ITEMS = 20;
const LOAD_MORE_PAUSE_MS = 520;
const LOAD_MORE_STAGGER_MS = 95;

type ProjectActivityRow = {
  readonly id: string;
  readonly type: string;
  readonly actorName: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly taskNumber: number;
  readonly taskTitle: string;
};

function statusLabel(value: unknown): string {
  if (typeof value === "string") {
    const status = migrateBacksterosTaskStatus(value);
    if (isBacksterosTaskStatus(status)) return getBacksterosTaskStatusLabel(status);
  }
  if (value == null || value === "") return "none";
  return String(value);
}

function priorityLabel(value: unknown): string {
  const priority = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(priority)) return getBacksterosTaskPriorityLabel(priority);
  return "none";
}

function describeActivity(type: string, data: Readonly<Record<string, unknown>>): string {
  if (type === "created") return "created the task";
  if (type === "status_changed") return `changed status to ${statusLabel(data.to)}`;
  if (type === "priority_changed") return `changed priority to ${priorityLabel(data.to)}`;
  if (type === "assignee_changed") {
    if (data.to == null) return "unassigned the task";
    const name =
      typeof data.toName === "string" && data.toName.trim() ? data.toName.trim() : "someone";
    return `assigned the task to ${name}`;
  }
  if (type === "due_date_changed") {
    return data.to == null ? "cleared the due date" : "changed the due date";
  }
  if (type === "project_changed") return "moved the task";
  if (type === "timer_started") return "started a timer";
  if (type === "timer_stopped") return "stopped a timer";
  if (type === "agent_worked") return "worked on the task";
  return type.replace(/_/g, " ");
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function keepElementInView(el: HTMLElement | null) {
  if (!el) return;
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    const canScrollY =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight + 1;
    if (canScrollY) {
      const parentRect = node.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const padding = 8;
      if (elRect.bottom > parentRect.bottom - padding) {
        node.scrollTop += elRect.bottom - parentRect.bottom + padding;
      } else if (elRect.top < parentRect.top + padding) {
        node.scrollTop -= parentRect.top + padding - elRect.top;
      }
      return;
    }
    node = node.parentElement;
  }
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
}

function toRow(
  activity: BacksterosTaskActivity,
  task: Pick<BacksterosTask, "number" | "title">,
): ProjectActivityRow {
  return {
    id: activity.id,
    type: activity.type,
    actorName: activity.actorName?.trim() || "Someone",
    data: activity.data ?? {},
    createdAt: activity.createdAt,
    taskNumber: task.number,
    taskTitle: task.title,
  };
}

/**
 * Desktop-parity project activity feed (`CodebaseProjectActivityPanel`):
 * actor + verb + task id, timeline rail, load-more in batches of 5.
 */
export function BacksterosCodebaseProjectActivityPanel(props: {
  readonly tasks: readonly BacksterosTask[];
  readonly projectKey: string | null;
  readonly projectId: string;
}) {
  const { tasks, projectKey, projectId } = props;
  const [rows, setRows] = useState<readonly ProjectActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ACTIVITY_PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [revealingIds, setRevealingIds] = useState<Set<string>>(() => new Set());
  const loadMoreGenerationRef = useRef(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const moreRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    setVisibleCount(ACTIVITY_PAGE_SIZE);
    setLoadingMore(false);
    setRevealingIds(new Set());
    loadMoreGenerationRef.current += 1;
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const recent = [...tasks]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 24);

    if (recent.length === 0) {
      setRows([]);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    void Promise.all(
      recent.map(async (task) => {
        try {
          const activities = await fetchBacksterosTaskActivities(task.id, controller.signal);
          return activities.map((activity) => toRow(activity, task));
        } catch {
          return [] as ProjectActivityRow[];
        }
      }),
    )
      .then((groups) => {
        if (controller.signal.aborted) return;
        setRows(
          groups
            .flat()
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, ACTIVITY_MAX_ITEMS),
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setRows([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [tasks]);

  const keepTailInView = useCallback(() => {
    const more = moreRowRef.current;
    if (more) {
      keepElementInView(more);
      return;
    }
    const lastEvent = listRef.current?.querySelector(".bos-task-activity-event:last-of-type");
    if (lastEvent instanceof HTMLElement) {
      keepElementInView(lastEvent);
    }
  }, []);

  const onLoadMore = useCallback(async () => {
    if (loadingMore) return;
    const remaining = rows.length - visibleCount;
    if (remaining <= 0) return;

    const batchSize = Math.min(ACTIVITY_PAGE_SIZE, remaining);
    const generation = ++loadMoreGenerationRef.current;

    setLoadingMore(true);
    setRevealingIds(new Set());
    await waitForPaint();
    if (generation !== loadMoreGenerationRef.current) return;
    keepTailInView();

    await new Promise((resolve) => setTimeout(resolve, LOAD_MORE_PAUSE_MS));
    if (generation !== loadMoreGenerationRef.current) return;

    for (let i = 0; i < batchSize; i++) {
      if (generation !== loadMoreGenerationRef.current) return;
      const nextIndex = visibleCount + i;
      const item = rows[nextIndex];
      if (!item) break;

      setRevealingIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      setVisibleCount(nextIndex + 1);
      await waitForPaint();
      if (generation !== loadMoreGenerationRef.current) return;
      keepTailInView();

      if (i < batchSize - 1) {
        await new Promise((resolve) => setTimeout(resolve, LOAD_MORE_STAGGER_MS));
        if (generation !== loadMoreGenerationRef.current) return;
      }
    }

    if (generation !== loadMoreGenerationRef.current) return;
    setLoadingMore(false);
    await waitForPaint();
    if (generation !== loadMoreGenerationRef.current) return;
    keepTailInView();
  }, [keepTailInView, loadingMore, rows, visibleCount]);

  const shown = rows.slice(0, visibleCount);
  const remaining = Math.max(0, rows.length - visibleCount);
  const nextBatch = Math.min(ACTIVITY_PAGE_SIZE, remaining);
  const showLoadMore = nextBatch > 0 || loadingMore;

  return (
    <section
      className="bos-task-activity"
      aria-label="Activity"
      aria-busy={loadingMore || undefined}
    >
      <header className="bos-task-activity__header">
        <h3 className="bos-task-activity__title">Activity</h3>
      </header>
      <div className="bos-task-activity__feed">
        {loading ? <p className="bos-task-activity__empty">Loading activity…</p> : null}
        {error ? (
          <p className="bos-task-activity__empty" role="alert">
            Could not load activity.
          </p>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="bos-task-activity__empty">No activity yet.</p>
        ) : null}
        {shown.length > 0 ? (
          <ul ref={listRef} className="bos-task-activity-timeline">
            {shown.map((row) => {
              const taskLabel = projectKey
                ? `${projectKey}-${row.taskNumber}`
                : row.taskTitle.trim() || `#${row.taskNumber}`;
              return (
                <li
                  key={row.id}
                  className={[
                    "bos-task-activity-event",
                    revealingIds.has(row.id) ? "bos-task-activity-event--reveal" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="bos-task-activity-event__leading">
                    <span className="bos-task-activity-event__rail" aria-hidden="true">
                      <span className="bos-task-activity-event__marker" />
                    </span>
                  </span>
                  <div className="bos-task-activity-event__text">
                    <strong>{row.actorName}</strong> {describeActivity(row.type, row.data)} on{" "}
                    <strong>{taskLabel}</strong>
                  </div>
                  <time className="bos-task-activity-event__time" dateTime={row.createdAt}>
                    {formatBacksterosActivityRelativeTime(row.createdAt)}
                  </time>
                </li>
              );
            })}
            {showLoadMore ? (
              <li ref={moreRowRef} className="bos-task-activity-more">
                {loadingMore ? (
                  <span className="bos-task-activity-more__status" aria-live="polite">
                    Loading activities…
                  </span>
                ) : (
                  <button
                    type="button"
                    className="bos-task-activity-more__btn"
                    onClick={() => {
                      void onLoadMore();
                    }}
                  >
                    {nextBatch === 1 ? "Load 1 more" : `Load ${nextBatch} more`}
                  </button>
                )}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
