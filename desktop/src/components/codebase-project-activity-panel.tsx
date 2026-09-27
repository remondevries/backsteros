"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskActivity } from "@backsteros/contracts";
import {
  TASK_SYSTEM_ACTIVITY_TYPES,
  activityTypesQuery,
} from "@backsteros/contracts";
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
  body?: string | null;
};

type FeedItem = {
  id: string;
  type: string;
  actorName: string;
  data: Record<string, unknown>;
  createdAt: string;
  taskNumber: number | null;
  taskTitle: string | null;
};

/** Matches the portal project page: show 5, then load 5 more, up to 20. */
const ACTIVITY_PAGE_SIZE = 5;
const ACTIVITY_MAX_ITEMS = 20;
const LOAD_MORE_PAUSE_MS = 520;
const LOAD_MORE_STAGGER_MS = 95;

const SYSTEM_TYPES_QUERY = activityTypesQuery([...TASK_SYSTEM_ACTIVITY_TYPES]);

/** PowerSync fallback — exclude comments (those live on the task detail feed). */
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
  AND a.type != 'comment'
  AND IFNULL(a.deleted_at, '') = ''
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
  return type.replace(/_/g, " ");
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

function sqliteRowsToFeed(rows: ActivityRow[]): FeedItem[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    actorName: row.actor_name?.trim() || "Someone",
    data: parseData(row.data),
    createdAt: row.created_at,
    taskNumber: row.task_number,
    taskTitle: row.task_title,
  }));
}

function apiActivitiesToFeed(activities: TaskActivity[]): FeedItem[] {
  return activities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    actorName: activity.actorName?.trim() || "Someone",
    data:
      activity.data && typeof activity.data === "object"
        ? activity.data
        : {},
    createdAt: activity.createdAt,
    taskNumber: activity.taskNumber ?? null,
    taskTitle: activity.taskTitle ?? null,
  }));
}

export function CodebaseProjectActivityPanel({
  projectId,
  projectKey,
  requestJson,
}: {
  projectId: string;
  projectKey: string;
  requestJson?: <T>(path: string, init?: RequestInit) => Promise<T>;
}) {
  const localQuery = usePowerSyncQuery<ActivityRow>(
    PROJECT_ACTIVITY_SQL,
    [projectId],
  );
  const [apiRows, setApiRows] = useState<FeedItem[] | null>(null);
  const [apiLoading, setApiLoading] = useState(Boolean(requestJson));
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestJson) {
      setApiRows(null);
      setApiLoading(false);
      setApiError(null);
      return;
    }
    const controller = new AbortController();
    setApiLoading(true);
    setApiError(null);
    const params = new URLSearchParams({
      projectId,
      limit: String(ACTIVITY_MAX_ITEMS),
    });
    if (SYSTEM_TYPES_QUERY) params.set("types", SYSTEM_TYPES_QUERY);
    void requestJson<{ activities: TaskActivity[] }>(
      `/api/v1/activities?${params.toString()}`,
      { signal: controller.signal },
    )
      .then((body) => {
        if (controller.signal.aborted) return;
        setApiRows(apiActivitiesToFeed(body.activities ?? []));
        setApiLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setApiRows(null);
        setApiLoading(false);
        setApiError(
          err instanceof Error ? err.message : "Could not load activity.",
        );
      });
    return () => controller.abort();
  }, [projectId, requestJson]);

  const useApi = Boolean(requestJson);
  const rows = useMemo(() => {
    if (useApi && apiRows) return apiRows;
    return sqliteRowsToFeed(localQuery.data ?? []);
  }, [apiRows, localQuery.data, useApi]);

  const loading = useApi ? apiLoading && !apiRows : localQuery.loading;
  const error =
    useApi && apiError && !apiRows
      ? apiError
      : !useApi
        ? (localQuery.error?.message ?? null)
        : null;
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
      const row = rows[nextIndex];
      if (!row) break;
      setRevealingIds((prev) => new Set(prev).add(row.id));
      setVisibleCount(nextIndex + 1);
      await waitForPaint();
      keepTailInView();
      if (i < batchSize - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, LOAD_MORE_STAGGER_MS),
        );
      }
    }

    if (generation !== loadMoreGenerationRef.current) return;
    setLoadingMore(false);
    setRevealingIds(new Set());
  }, [keepTailInView, loadingMore, rows, visibleCount]);

  const visible = rows.slice(0, visibleCount);
  const canLoadMore = visibleCount < rows.length;

  return (
    <section className="task-activity" aria-label="Project activity">
      <header className="task-activity__header">
        <h3 className="task-activity__title">Activity</h3>
      </header>
      <div className="task-activity__feed">
        {loading ? <p className="task-activity__empty">Loading activity…</p> : null}
        {!loading && error ? (
          <p className="task-activity__empty" role="alert">
            {error}
          </p>
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <p className="task-activity__empty">No activity yet.</p>
        ) : null}
        {!loading && !error && visible.length > 0 ? (
          <ul ref={listRef} className="task-activity-timeline">
            {visible.map((row) => {
              const taskLabel =
                row.taskNumber != null
                  ? `${projectKey}-${row.taskNumber}`
                  : row.taskTitle?.trim() || "a task";
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
                    <strong>{row.actorName}</strong>{" "}
                    {describeActivity(row.type, row.data)} on{" "}
                    <strong>{taskLabel}</strong>
                  </div>
                  <time
                    className="task-activity-event__time"
                    dateTime={row.createdAt}
                  >
                    {formatRelativeTime(row.createdAt)}
                  </time>
                </li>
              );
            })}
            {canLoadMore ? (
              <li
                ref={moreRowRef}
                className="task-activity-more"
              >
                {loadingMore ? (
                  <span className="task-activity-more__status" aria-live="polite">
                    Loading…
                  </span>
                ) : (
                  <button
                    type="button"
                    className="task-activity-more__btn"
                    onClick={() => void onLoadMore()}
                  >
                    Show more
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
