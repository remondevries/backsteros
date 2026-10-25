import {
  and,
  asc,
  eq,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  formatTaskDisplayKey,
  TASK_LIST_DEFAULT_EXCLUDED_STATUSES,
} from "../../lib/task-filters.js";
import type { DbExecutor } from "./shared.js";
import { db } from "../../db/index.js";
import { resolveTaskRef } from "../../lib/entity-refs.js";
import { projects, tasks } from "../../db/schema.js";
import { decodeUpdatedAtCursor, encodeUpdatedAtCursor } from "../../lib/list-query.js";
const TASK_SEARCH_SNIPPET_MAX = 280;

export type TaskSearchHit = {
  id: string;
  type: "task";
  key: string;
  projectId: string | null;
  status: string;
  title: string;
  snippet: string | null;
  updatedAt: string;
};

function taskSearchSnippet(description: string | null | undefined): string | null {
  if (description == null) return null;
  const trimmed = description.trim();
  if (!trimmed) return null;
  if (trimmed.length <= TASK_SEARCH_SNIPPET_MAX) return trimmed;
  return `${trimmed.slice(0, TASK_SEARCH_SNIPPET_MAX - 1)}…`;
}

function toTaskSearchHit(row: {
  id: string;
  projectId: string | null;
  number: number;
  title: string;
  description: string | null;
  status: string;
  updatedAt: Date;
  projectKey: string | null;
}): TaskSearchHit {
  return {
    id: row.id,
    type: "task",
    key: formatTaskDisplayKey(row.projectKey, row.number),
    projectId: row.projectId,
    status: row.status,
    title: row.title,
    snippet: taskSearchSnippet(row.description),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Agent task text search for `GET /api/v1/search?type=task` (OS-55 / OS-81).
 * SQL ILIKE on title/description with keyset pagination; prefers an exact
 * display-key or id match on the first page.
 *
 * Without `statuses`, text matches exclude completed/canceled/duplicated
 * (same default as paginated GET /tasks). Exact key/id hits still return.
 * Palette `/global-search` passes `applyDefaultStatusExclusion: false`.
 */
export async function searchTasks(
  input: {
    workspaceId: string;
    q: string;
    projectId?: string;
    /** Palette / global-search contact scope (OS-73). */
    contactId?: string;
    /** Palette inbox-only scope (OS-73). */
    inboxOnly?: boolean;
    statuses?: string[];
    limit?: number;
    cursor?: string;
    /**
     * Default true. When false, text search includes terminal statuses
     * (command palette). Ignored when `statuses` is set.
     */
    applyDefaultStatusExclusion?: boolean;
  },
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<{
  results: TaskSearchHit[];
  nextCursor: string | null;
  appliedDefaults?: {
    excludedStatuses: Array<(typeof TASK_LIST_DEFAULT_EXCLUDED_STATUSES)[number]>;
  };
}> {
  const limit = input.limit ?? 20;
  const q = input.q.trim();
  const exactHits: TaskSearchHit[] = [];
  const excludeIds = new Set<string>();
  const usesDefaultExclusion =
    (input.applyDefaultStatusExclusion ?? true) && !input.statuses?.length;

  if (!input.cursor?.trim()) {
    const exactId = await resolveTaskRef(input.workspaceId, q, executor);
    if (exactId) {
      const exactConditions: SQL[] = [
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.id, exactId),
        isNull(tasks.deletedAt),
      ];
      if (input.projectId) {
        exactConditions.push(eq(tasks.projectId, input.projectId));
      }
      if (input.contactId) {
        exactConditions.push(eq(tasks.contactId, input.contactId));
      }
      if (input.inboxOnly) {
        exactConditions.push(eq(tasks.inbox, true));
      }
      if (input.statuses?.length) {
        exactConditions.push(inArray(tasks.status, input.statuses));
      }
      // OS-81: exact display-key / id lookup is not subject to the default
      // terminal-status exclusion (same as GET /tasks/:id).
      const [row] = await executor
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          number: tasks.number,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          updatedAt: tasks.updatedAt,
          projectKey: projects.key,
        })
        .from(tasks)
        .leftJoin(
          projects,
          and(
            eq(projects.id, tasks.projectId),
            eq(projects.workspaceId, tasks.workspaceId),
          ),
        )
        .where(and(...exactConditions))
        .limit(1);
      if (row) {
        exactHits.push(toTaskSearchHit(row));
        excludeIds.add(row.id);
      }
    }
  }

  const pattern = `%${q}%`;
  const conditions: SQL[] = [
    eq(tasks.workspaceId, input.workspaceId),
    isNull(tasks.deletedAt),
    or(ilike(tasks.title, pattern), ilike(tasks.description, pattern))!,
  ];
  if (excludeIds.size) {
    conditions.push(notInArray(tasks.id, [...excludeIds]));
  }
  if (input.projectId) {
    conditions.push(eq(tasks.projectId, input.projectId));
  }
  if (input.contactId) {
    conditions.push(eq(tasks.contactId, input.contactId));
  }
  if (input.inboxOnly) {
    conditions.push(eq(tasks.inbox, true));
  }
  if (input.statuses?.length) {
    conditions.push(inArray(tasks.status, input.statuses));
  } else if (usesDefaultExclusion) {
    conditions.push(
      notInArray(tasks.status, [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES]),
    );
  }
  if (input.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(input.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${tasks.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${tasks.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${tasks.id} > ${cursor.id}
        )
      )`,
    );
  }

  const need = Math.max(0, limit - exactHits.length);
  const rows =
    need > 0
      ? await executor
          .select({
            id: tasks.id,
            projectId: tasks.projectId,
            number: tasks.number,
            title: tasks.title,
            description: tasks.description,
            status: tasks.status,
            updatedAt: tasks.updatedAt,
            projectKey: projects.key,
          })
          .from(tasks)
          .leftJoin(
            projects,
            and(
              eq(projects.id, tasks.projectId),
              eq(projects.workspaceId, tasks.workspaceId),
            ),
          )
          .where(and(...conditions))
          .orderBy(
            sql`date_trunc('milliseconds', ${tasks.updatedAt}) desc`,
            asc(tasks.id),
          )
          .limit(need + 1)
      : [];

  const hasMore = rows.length > need;
  const page = hasMore ? rows.slice(0, need) : rows;
  const results = [...exactHits, ...page.map(toTaskSearchHit)];
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeUpdatedAtCursor(
          { id: last.id, updatedAt: last.updatedAt },
          nowMs,
        )
      : null;

  return {
    results,
    nextCursor,
    ...(usesDefaultExclusion
      ? {
          appliedDefaults: {
            excludedStatuses: [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES],
          },
        }
      : {}),
  };
}
