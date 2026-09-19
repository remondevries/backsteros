"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTaskPriorityLabel,
  getTaskStatusLabel,
  isTaskStatus,
} from "@backsteros/ui";

import { usePowerSyncQuery } from "../lib/powersync-context";

type ActivityRow = {
  id: string;
  type: string;
  actor_name: string | null;
  data: string | null;
  created_at: string;
  task_number: number | null;
  task_title: string | null;
};

/** Matches the portal project page: show 5, then load 5 more, up to 20. */
const ACTIVITY_PAGE_SIZE = 5;
const ACTIVITY_MAX_ITEMS = 20;
const LOAD_MORE_PAUSE_MS = 520;
const LOAD_MORE_STAGGER_MS = 95;

const PROJECT_ACTIVITY_SQL = `
SELECT
  a.id,
  a.type,
  a.actor_name,
  a.data,
  a.created_at,
  t.number AS task_number,
  t.title AS task_title
FROM task_activities a
INNER JOIN tasks t ON t.id = a.task_id
WHERE t.project_id = ?
  AND IFNULL(t.deleted_at, '') = ''
ORDER BY a.created_at DESC
LIMIT ${ACTIVITY_MAX_ITEMS}
`;

function parseData(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed activity payloads.
  }
  return {};
}

function statusLabel(value: unknown): string {
  if (typeof value === "string" && isTaskStatus(value)) {
    return getTaskStatusLabel(value);
  }
  if (value == null || value === "") return "none";
  return String(value);
}

function priorityLabel(value: unknown): string {
  const priority = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(priority)) return getTaskPriorityLabel(priority);
  return "none";
}

function describeActivity(
  type: string,
  data: Record<string, unknown>,
): string {
  if (type === "created") return "created the task";
  if (type === "status_changed") {
    return `changed status to ${statusLabel(data.to)}`;
  }
  if (type === "priority_changed") {
    return `changed priority to ${priorityLabel(data.to)}`;
  }
  if (type === "assignee_changed") {
    if (data.to == null) return "unassigned the task";
    const name =
      typeof data.toName === "string" && data.toName.trim()
        ? data.toName.trim()
        : "someone";
    return `assigned the task to ${name}`;
  }
  if (type === "due_date_changed") {
    return data.to == null ? "cleared the due date" : "changed the due date";
  }
  if (type === "project_changed") return "moved the task";
  if (type === "timer_started") return "started a timer";
  if (type === "timer_stopped") return "stopped a timer";
  if (type === "agent_worked") return "worked on the task";
  return type.replaceAll("_", " ");
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
      (overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowY === "overlay") &&
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

export function CodebaseProjectActivityPanel({
  projectId,
  projectKey,
}: {
  projectId: string;
  projectKey: string;
}) {
  const { data, loading, error } = usePowerSyncQuery<ActivityRow>(
    PROJECT_ACTIVITY_SQL,
    [projectId],
  );
  const rows = data ?? [];
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
    return () => {
      loadMoreGenerationRef.current += 1;
    };
  }, []);

  const keepTailInView = useCallback(() => {
    const more = moreRowRef.current;
    if (more) {
      keepElementInView(more);
      return;
    }
    const lastEvent = listRef.current?.querySelector(
      ".task-activity-event:last-of-type",
    );
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
      className="task-activity"
      aria-label="Activity"
      aria-busy={loadingMore || undefined}
    >
      <header className="task-activity__header">
        <h3 className="task-activity__title">Activity</h3>
      </header>
      <div className="task-activity__feed">
        {loading ? <p className="task-activity__empty">Loading activity…</p> : null}
        {error ? (
          <p className="task-activity__empty" role="alert">
            Could not load activity.
          </p>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <p className="task-activity__empty">No activity yet.</p>
        ) : null}
        {shown.length > 0 ? (
          <ul ref={listRef} className="task-activity-timeline">
            {shown.map((row) => {
              const taskLabel =
                row.task_number != null
                  ? `${projectKey}-${row.task_number}`
                  : (row.task_title?.trim() || "Task");
              const actor = row.actor_name?.trim() || "Someone";
              const message = describeActivity(row.type, parseData(row.data));
              return (
                <li
                  key={row.id}
                  className={[
                    "task-activity-event",
                    revealingIds.has(row.id) ? "task-activity-event--reveal" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <span className="task-activity-event__leading">
                    <span
                      className="task-activity-event__rail"
                      aria-hidden="true"
                    >
                      <span className="task-activity-event__marker" />
                    </span>
                  </span>
                  <div className="task-activity-event__text">
                    <strong>{actor}</strong> {message} on{" "}
                    <strong>{taskLabel}</strong>
                  </div>
                  <time
                    className="task-activity-event__time"
                    dateTime={row.created_at}
                  >
                    {formatRelativeTime(row.created_at)}
                  </time>
                </li>
              );
            })}
            {showLoadMore ? (
              <li
                ref={moreRowRef}
                className="task-activity-more"
              >
                {loadingMore ? (
                  <span className="task-activity-more__status" aria-live="polite">
                    Loading activities…
                  </span>
                ) : (
                  <button
                    type="button"
                    className="task-activity-more__btn"
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
