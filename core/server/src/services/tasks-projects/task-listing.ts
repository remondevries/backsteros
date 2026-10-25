import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { DbExecutor } from "./shared.js";
import { db } from "../../db/index.js";
import { contacts, documents, projects, tasks } from "../../db/schema.js";
import {
  decodeTaskListCursor,
  type DueDateFilter,
  encodeTaskListCursor,
  formatTaskDisplayKey,
  type ParsedTaskListQuery,
  TASK_LIST_DEFAULT_EXCLUDED_STATUSES,
  taskListUsesDefaultStatusExclusion,
} from "../../lib/task-filters.js";
import {
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  LIST_DEFAULT_LIMIT,
  type ParsedDueTasksListQuery,
} from "../../lib/list-query.js";
export async function listTasks(
  workspaceId: string,
  filters: {
    /** Single id or OR-list (OS-45: comma lists work in legacy mode too). */
    projectId?: string | string[];
    contactId?: string | string[];
    assigneeId?: string | string[];
    relatedContactId?: string | string[];
    relatedOrganizationId?: string | string[];
    status?: string | string[];
    inbox?: boolean;
    support?: boolean;
    notification?: boolean;
  } = {},
  executor: DbExecutor = db,
) {
  const conditions = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
  ];
  const list = (value: string | string[] | undefined): string[] =>
    (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);

  const projectIds = list(filters.projectId);
  if (projectIds.length) conditions.push(inArray(tasks.projectId, projectIds));
  const contactIds = list(filters.contactId);
  if (contactIds.length) conditions.push(inArray(tasks.contactId, contactIds));
  const assigneeIds = list(filters.assigneeId);
  if (assigneeIds.length) {
    conditions.push(inArray(tasks.assigneeId, assigneeIds));
  }
  const relatedContact = relatedContactOrCondition(
    list(filters.relatedContactId),
  );
  if (relatedContact) conditions.push(relatedContact);
  const relatedOrg = relatedOrganizationOrCondition(
    list(filters.relatedOrganizationId),
  );
  if (relatedOrg) conditions.push(relatedOrg);
  const statuses = list(filters.status);
  if (statuses.length) conditions.push(inArray(tasks.status, statuses));
  if (filters.inbox !== undefined) conditions.push(eq(tasks.inbox, filters.inbox));
  if (filters.support !== undefined) {
    conditions.push(eq(tasks.support, filters.support));
  }
  if (filters.notification !== undefined) {
    conditions.push(eq(tasks.notification, filters.notification));
  }

  return executor
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(tasks.sortOrder, desc(tasks.updatedAt));
}

/** contactId → display name (name, else email). Soft-deleted contacts omitted. */
export async function getContactNameMap(
  workspaceId: string,
  contactIds?: Array<string | null | undefined>,
  executor: DbExecutor = db,
): Promise<Map<string, string>> {
  const ids =
    contactIds === undefined
      ? undefined
      : [
          ...new Set(
            contactIds.filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        ];
  const out = new Map<string, string>();
  if (ids && !ids.length) return out;
  const rows = await executor
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
        ...(ids ? [inArray(contacts.id, ids)] : []),
      ),
    );
  for (const row of rows) {
    const name = row.name?.trim() || row.email?.trim();
    if (name) out.set(row.id, name);
  }
  return out;
}

export type TaskListItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: number;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectKey: string | null;
  dueDate: string | null;
  linkedDocumentIds: string[];
  linkedContactIds: string[];
  linkedTaskIds: string[];
  linkedEmailIds: string[];
  createdAt: string;
  updatedAt: string;
  /** Only present with `updatedSince` (change feed includes deletions). */
  deletedAt?: string | null;
};

export type ListTasksPaginatedResult = {
  items: TaskListItem[];
  nextCursor: string | null;
  totalCount?: number;
  /**
   * When the default terminal-status exclusion applies and
   * `includeTotalCount=true`: how many matching tasks were hidden.
   */
  excludedCount?: number;
  /** Present when completed/canceled/duplicated were hidden by default (OS-57). */
  appliedDefaults?: {
    excludedStatuses: Array<(typeof TASK_LIST_DEFAULT_EXCLUDED_STATUSES)[number]>;
  };
};

function dueDateSqlCondition(filter: DueDateFilter): SQL {
  if (filter.op === "before") {
    return and(isNotNull(tasks.dueDate), lt(tasks.dueDate, filter.date))!;
  }
  if (filter.op === "after") {
    return and(isNotNull(tasks.dueDate), gt(tasks.dueDate, filter.date))!;
  }
  return and(
    isNotNull(tasks.dueDate),
    gte(tasks.dueDate, filter.start),
    lte(tasks.dueDate, filter.end),
  )!;
}

function followUpDateSqlCondition(filter: DueDateFilter): SQL {
  if (filter.op === "before") {
    return and(
      isNotNull(tasks.followUpDate),
      lt(tasks.followUpDate, filter.date),
    )!;
  }
  if (filter.op === "after") {
    return and(
      isNotNull(tasks.followUpDate),
      gt(tasks.followUpDate, filter.date),
    )!;
  }
  return and(
    isNotNull(tasks.followUpDate),
    gte(tasks.followUpDate, filter.start),
    lte(tasks.followUpDate, filter.end),
  )!;
}

function relatedContactOrCondition(ids: string[]): SQL | undefined {
  if (!ids.length) return undefined;
  return or(
    ...ids.map(
      (id) =>
        sql`${tasks.relatedContactIds} @> ${JSON.stringify([id])}::jsonb`,
    ),
  );
}

function relatedOrganizationOrCondition(ids: string[]): SQL | undefined {
  if (!ids.length) return undefined;
  return or(
    ...ids.map(
      (id) =>
        sql`${tasks.relatedOrganizationIds} @> ${JSON.stringify([id])}::jsonb`,
    ),
  );
}

function linkedEmailsOrCondition(ids: string[]): SQL | undefined {
  if (!ids.length) return undefined;
  return or(
    ...ids.map(
      (id) =>
        sql`${tasks.linkedEmailIds} @> ${JSON.stringify([id])}::jsonb`,
    ),
  );
}

/** Tasks whose display key appears in any of the given documents' linkedTasks. */
function linkedDocumentsCondition(documentIds: string[]): SQL {
  return sql`exists (
    select 1
    from ${documents} d
    where d.workspace_id = ${tasks.workspaceId}
      and d.id in (${sql.join(
        documentIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      and d.deleted_at is null
      and d.kind = 'document'
      and (
        d.properties->'linkedTasks' @> to_jsonb(
          coalesce(${projects.key}, 'INBOX') || '-' || ${tasks.number}::text
        )
        or d.properties->>'linkedTasks' = (
          coalesce(${projects.key}, 'INBOX') || '-' || ${tasks.number}::text
        )
      )
  )`;
}

/**
 * Tasks co-linked via document front-matter linkedTasks with any seed task id.
 * Excludes the seed tasks themselves.
 */
function linkedTasksCondition(
  workspaceId: string,
  seedTaskIds: string[],
): SQL {
  return sql`${tasks.id} in (
    with seed as (
      select
        t.id as seed_id,
        (coalesce(p.key, 'INBOX') || '-' || t.number::text) as display_key
      from ${tasks} t
      left join ${projects} p
        on p.id = t.project_id and p.workspace_id = t.workspace_id
      where t.workspace_id = ${workspaceId}
        and (
          t.id in (${sql.join(
            seedTaskIds.map((id) => sql`${id}`),
            sql`, `,
          )})
          -- OS-45: also accept display keys (e.g. OS-28) as seeds.
          or (coalesce(p.key, 'INBOX') || '-' || t.number::text) in (${sql.join(
            seedTaskIds.map((id) => sql`${id.toUpperCase()}`),
            sql`, `,
          )})
        )
        and t.deleted_at is null
    ),
    docs as (
      select d.properties->'linkedTasks' as linked
      from ${documents} d
      cross join seed s
      where d.workspace_id = ${workspaceId}
        and d.deleted_at is null
        and d.kind = 'document'
        and (
          d.properties->'linkedTasks' @> to_jsonb(s.display_key)
          or d.properties->>'linkedTasks' = s.display_key
        )
    ),
    keys as (
      select distinct trim(both '"' from elem::text) as display_key
      from docs,
      lateral jsonb_array_elements(
        case
          when jsonb_typeof(docs.linked) = 'array' then docs.linked
          when jsonb_typeof(docs.linked) = 'string' then jsonb_build_array(docs.linked)
          else '[]'::jsonb
        end
      ) as elem
      union
      select docs.linked #>> '{}' as display_key
      from docs
      where jsonb_typeof(docs.linked) = 'string'
    )
    select t2.id
    from ${tasks} t2
    left join ${projects} p2
      on p2.id = t2.project_id and p2.workspace_id = t2.workspace_id
    join keys k
      on (coalesce(p2.key, 'INBOX') || '-' || t2.number::text) = k.display_key
    where t2.workspace_id = ${workspaceId}
      and t2.deleted_at is null
      and t2.id not in (select seed_id from seed)
  )`;
}

function buildPaginatedTaskConditions(
  workspaceId: string,
  filters: ParsedTaskListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(tasks.workspaceId, workspaceId)];

  if (filters.updatedSince) {
    // Change feed (OS-45): include soft-deleted rows so callers see removals.
    conditions.push(gte(tasks.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(tasks.deletedAt));
  }

  if (filters.projectIds.length) {
    conditions.push(inArray(tasks.projectId, filters.projectIds));
  }
  if (filters.statuses.length) {
    conditions.push(inArray(tasks.status, filters.statuses));
  } else if (!filters.updatedSince) {
    conditions.push(
      notInArray(tasks.status, [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES]),
    );
  }
  if (filters.assigneeIds.length) {
    conditions.push(inArray(tasks.assigneeId, filters.assigneeIds));
  }
  if (filters.contactIds.length) {
    conditions.push(inArray(tasks.contactId, filters.contactIds));
  }
  const relatedContact = relatedContactOrCondition(filters.relatedContactIds);
  if (relatedContact) conditions.push(relatedContact);
  const relatedOrg = relatedOrganizationOrCondition(
    filters.relatedOrganizationIds,
  );
  if (relatedOrg) conditions.push(relatedOrg);
  const linkedEmails = linkedEmailsOrCondition(filters.linkedEmailIds);
  if (linkedEmails) conditions.push(linkedEmails);
  if (filters.dueDate) {
    conditions.push(dueDateSqlCondition(filters.dueDate));
  }
  if (filters.followUpDate) {
    conditions.push(followUpDateSqlCondition(filters.followUpDate));
  }
  if (filters.inbox !== undefined) {
    conditions.push(eq(tasks.inbox, filters.inbox));
  }
  if (filters.support !== undefined) {
    conditions.push(eq(tasks.support, filters.support));
  }
  if (filters.notification !== undefined) {
    conditions.push(eq(tasks.notification, filters.notification));
  }
  if (filters.linkedDocumentIds.length) {
    conditions.push(linkedDocumentsCondition(filters.linkedDocumentIds));
  }
  if (filters.linkedTaskIds.length) {
    conditions.push(
      linkedTasksCondition(workspaceId, filters.linkedTaskIds),
    );
  }

  return conditions;
}

function cursorSqlCondition(cursor: ReturnType<typeof decodeTaskListCursor>): SQL {
  // Sort key: (coalesce(due_date, infinity), created_at, id) ascending.
  // Truncate to milliseconds so ISO cursor values match JS Date precision.
  const dueKey =
    cursor.dueDate == null
      ? sql`'infinity'::timestamptz`
      : sql`date_trunc('milliseconds', ${cursor.dueDate}::timestamptz)`;
  return sql`(
    coalesce(date_trunc('milliseconds', ${tasks.dueDate}), 'infinity'::timestamptz),
    date_trunc('milliseconds', ${tasks.createdAt}),
    ${tasks.id}
  ) > (
    ${dueKey},
    date_trunc('milliseconds', ${cursor.createdAt}::timestamptz),
    ${cursor.id}
  )`;
}

async function loadTaskLinkEnrichment(
  workspaceId: string,
  rows: Array<{
    id: string;
    number: number;
    projectKey: string | null;
  }>,
  executor: DbExecutor,
): Promise<
  Map<
    string,
    {
      linkedDocumentIds: string[];
      linkedTaskIds: string[];
    }
  >
> {
  const result = new Map<
    string,
    { linkedDocumentIds: string[]; linkedTaskIds: string[] }
  >();
  if (!rows.length) return result;

  const keyByTaskId = new Map<string, string>();
  const taskIdByKey = new Map<string, string>();
  for (const row of rows) {
    const key = formatTaskDisplayKey(row.projectKey, row.number);
    keyByTaskId.set(row.id, key);
    taskIdByKey.set(key, row.id);
    result.set(row.id, { linkedDocumentIds: [], linkedTaskIds: [] });
  }

  const keys = [...keyByTaskId.values()];
  const docRows = await executor
    .select({
      id: documents.id,
      properties: documents.properties,
    })
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        isNull(documents.deletedAt),
        eq(documents.kind, "document"),
        or(
          ...keys.map(
            (key) =>
              sql`(
                ${documents.properties}->'linkedTasks' @> ${JSON.stringify([key])}::jsonb
                or ${documents.properties}->>'linkedTasks' = ${key}
              )`,
          ),
        ),
      ),
    );

  const linkedKeysByTask = new Map<string, Set<string>>();
  for (const taskId of keyByTaskId.keys()) {
    linkedKeysByTask.set(taskId, new Set());
  }

  for (const doc of docRows) {
    const linked = (doc.properties as { linkedTasks?: unknown } | null)
      ?.linkedTasks;
    const listed: string[] = [];
    if (typeof linked === "string" && linked.trim()) {
      listed.push(linked.trim());
    } else if (Array.isArray(linked)) {
      for (const entry of linked) {
        if (typeof entry === "string" && entry.trim()) {
          listed.push(entry.trim());
        }
      }
    }
    for (const key of listed) {
      const taskId = taskIdByKey.get(key);
      if (!taskId) continue;
      const bucket = result.get(taskId)!;
      if (!bucket.linkedDocumentIds.includes(doc.id)) {
        bucket.linkedDocumentIds.push(doc.id);
      }
      for (const other of listed) {
        if (other === key) continue;
        linkedKeysByTask.get(taskId)!.add(other);
      }
    }
  }

  const unresolvedKeys = new Set<string>();
  for (const keysForTask of linkedKeysByTask.values()) {
    for (const key of keysForTask) {
      if (!taskIdByKey.has(key)) unresolvedKeys.add(key);
    }
  }

  if (unresolvedKeys.size) {
    const resolved = await resolveTaskIdsByDisplayKeys(
      workspaceId,
      [...unresolvedKeys],
      executor,
    );
    for (const [key, id] of resolved) {
      taskIdByKey.set(key, id);
    }
  }

  for (const [taskId, keysForTask] of linkedKeysByTask) {
    const bucket = result.get(taskId)!;
    for (const key of keysForTask) {
      const otherId = taskIdByKey.get(key);
      if (otherId && otherId !== taskId && !bucket.linkedTaskIds.includes(otherId)) {
        bucket.linkedTaskIds.push(otherId);
      }
    }
  }

  return result;
}

async function resolveTaskIdsByDisplayKeys(
  workspaceId: string,
  displayKeys: string[],
  executor: DbExecutor,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!displayKeys.length) return out;

  const parsed = displayKeys
    .map((key) => {
      const match = key.trim().match(/^([A-Za-z][A-Za-z0-9_]*)-(\d+)$/);
      if (!match) return null;
      return { key, projectKey: match[1]!, number: Number(match[2]) };
    })
    .filter((row): row is { key: string; projectKey: string; number: number } =>
      Boolean(row),
    );

  if (!parsed.length) return out;

  const rows = await executor
    .select({
      id: tasks.id,
      number: tasks.number,
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
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        or(
          ...parsed.map(
            (entry) =>
              and(
                eq(tasks.number, entry.number),
                entry.projectKey.toUpperCase() === "INBOX"
                  ? isNull(tasks.projectId)
                  : eq(projects.key, entry.projectKey),
              )!,
          ),
        ),
      ),
    );

  for (const row of rows) {
    const key = formatTaskDisplayKey(row.projectKey, row.number);
    out.set(key, row.id);
  }
  return out;
}

/**
 * Cursor-paginated task list with multi-value filters (OS-28).
 * Default sort: dueDate ASC (nulls last), then createdAt ASC, then id.
 */
export async function listTasksPaginated(
  workspaceId: string,
  filters: ParsedTaskListQuery,
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<ListTasksPaginatedResult> {
  const conditions = buildPaginatedTaskConditions(workspaceId, filters);
  if (filters.cursor?.trim()) {
    const cursor = decodeTaskListCursor(filters.cursor, nowMs);
    conditions.push(cursorSqlCondition(cursor));
  }

  const limit = filters.limit;
  const rows = await executor
    .select({
      id: tasks.id,
      workspaceId: tasks.workspaceId,
      projectId: tasks.projectId,
      contactId: tasks.contactId,
      assigneeId: tasks.assigneeId,
      relatedContactIds: tasks.relatedContactIds,
      relatedOrganizationIds: tasks.relatedOrganizationIds,
      linkedEmailIds: tasks.linkedEmailIds,
      labelIds: tasks.labelIds,
      number: tasks.number,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      sortOrder: tasks.sortOrder,
      dueDate: tasks.dueDate,
      dueEndDate: tasks.dueEndDate,
      followUpDate: tasks.followUpDate,
      triagedAt: tasks.triagedAt,
      inbox: tasks.inbox,
      support: tasks.support,
      notification: tasks.notification,
      links: tasks.links,
      agentChatId: tasks.agentChatId,
      agentWorkingContactId: tasks.agentWorkingContactId,
      agentWorkingStartedAt: tasks.agentWorkingStartedAt,
      agentWorkingLabel: tasks.agentWorkingLabel,
      agentWorkingKind: tasks.agentWorkingKind,
      linkedCommitShas: tasks.linkedCommitShas,
      automateCompletion: tasks.automateCompletion,
      autoReviewDeliveryStatus: tasks.autoReviewDeliveryStatus,
      habitId: tasks.habitId,
      legacySource: tasks.legacySource,
      completedAt: tasks.completedAt,
      agentCreatedAt: tasks.agentCreatedAt,
      agentInboxApprovedAt: tasks.agentInboxApprovedAt,
      trackedMinutes: tasks.trackedMinutes,
      trackedDurationSeconds: tasks.trackedDurationSeconds,
      inboxUpdatedAt: tasks.inboxUpdatedAt,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      deletedAt: tasks.deletedAt,
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
      sql`coalesce(date_trunc('milliseconds', ${tasks.dueDate}), 'infinity'::timestamptz) asc`,
      sql`date_trunc('milliseconds', ${tasks.createdAt}) asc`,
      asc(tasks.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const enrichment = await loadTaskLinkEnrichment(workspaceId, page, executor);
  const contactNames = await getContactNameMap(
    workspaceId,
    [
      ...page.map((row) => row.assigneeId),
      ...page.map((row) => row.agentWorkingContactId),
    ],
    executor,
  );

  const items: TaskListItem[] = page.map((row) => {
    const links = enrichment.get(row.id) ?? {
      linkedDocumentIds: [],
      linkedTaskIds: [],
    };
    const linkedContactIds = [
      ...new Set(
        [
          row.contactId,
          ...(Array.isArray(row.relatedContactIds)
            ? row.relatedContactIds
            : []),
        ].filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const linkedEmailIds = Array.isArray(row.linkedEmailIds)
      ? row.linkedEmailIds.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];
    return {
      id: row.id,
      key: formatTaskDisplayKey(row.projectKey, row.number),
      title: row.title,
      status: row.status,
      priority: row.priority,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeId
        ? (contactNames.get(row.assigneeId) ?? null)
        : null,
      projectId: row.projectId,
      projectKey: row.projectKey ?? null,
      dueDate: row.dueDate?.toISOString() ?? null,
      followUpDate: row.followUpDate?.toISOString() ?? null,
      linkedDocumentIds: links.linkedDocumentIds,
      linkedContactIds,
      linkedTaskIds: links.linkedTaskIds,
      linkedEmailIds,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      agentWorkingContactId: row.agentWorkingContactId ?? null,
      agentWorkingStartedAt: row.agentWorkingStartedAt?.toISOString() ?? null,
      agentWorkingLabel: row.agentWorkingLabel ?? null,
      agentWorkingKind:
        row.agentWorkingKind === "working" ||
        row.agentWorkingKind === "reviewing"
          ? row.agentWorkingKind
          : row.agentWorkingContactId
            ? "working"
            : null,
      agentWorkingContactName: row.agentWorkingContactId
        ? (contactNames.get(row.agentWorkingContactId) ?? null)
        : null,
      ...(filters.updatedSince
        ? { deletedAt: row.deletedAt?.toISOString() ?? null }
        : {}),
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeTaskListCursor(
          {
            dueDate: last.dueDate,
            createdAt: last.createdAt,
            id: last.id,
          },
          nowMs,
        )
      : null;

  const usesDefaultExclusion = taskListUsesDefaultStatusExclusion(filters);

  let totalCount: number | undefined;
  let excludedCount: number | undefined;
  if (filters.includeTotalCount) {
    const countConditions = buildPaginatedTaskConditions(workspaceId, filters);
    const [countRow] = await executor
      .select({ value: sql<number>`count(*)::int` })
      .from(tasks)
      .leftJoin(
        projects,
        and(
          eq(projects.id, tasks.projectId),
          eq(projects.workspaceId, tasks.workspaceId),
        ),
      )
      .where(and(...countConditions));
    totalCount = Number(countRow?.value ?? 0);

    // OS-57: same other filters, but only the default-excluded statuses.
    if (usesDefaultExclusion) {
      const excludedConditions = buildPaginatedTaskConditions(workspaceId, {
        ...filters,
        statuses: [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES],
      });
      const [excludedRow] = await executor
        .select({ value: sql<number>`count(*)::int` })
        .from(tasks)
        .leftJoin(
          projects,
          and(
            eq(projects.id, tasks.projectId),
            eq(projects.workspaceId, tasks.workspaceId),
          ),
        )
        .where(and(...excludedConditions));
      excludedCount = Number(excludedRow?.value ?? 0);
    }
  }

  return {
    items,
    nextCursor,
    ...(totalCount !== undefined ? { totalCount } : {}),
    ...(excludedCount !== undefined ? { excludedCount } : {}),
    ...(usesDefaultExclusion
      ? {
          appliedDefaults: {
            excludedStatuses: [...TASK_LIST_DEFAULT_EXCLUDED_STATUSES],
          },
        }
      : {}),
  };
}

export async function getTaskById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, id),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listDueTasks(
  workspaceId: string,
  before = new Date(),
  executor: DbExecutor = db,
) {
  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        isNull(tasks.completedAt),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, before),
      ),
    )
    .orderBy(asc(tasks.dueDate), asc(tasks.sortOrder));
}

export type DueTaskListItem = {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: number;
  projectId: string | null;
  dueDate: string | null;
  updatedAt: string;
};

export async function listDueTasksPaginated(
  workspaceId: string,
  filters: ParsedDueTasksListQuery,
  executor: DbExecutor = db,
  nowMs: number = Date.now(),
): Promise<{ items: DueTaskListItem[]; nextCursor: string | null }> {
  const conditions: SQL[] = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
    isNull(tasks.completedAt),
    isNotNull(tasks.dueDate),
    lte(tasks.dueDate, filters.before),
  ];
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
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
  const limit = Number.isFinite(filters.limit) ? filters.limit : LIST_DEFAULT_LIMIT;
  const rows = await executor
    .select({
      id: tasks.id,
      number: tasks.number,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      projectId: tasks.projectId,
      dueDate: tasks.dueDate,
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
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      key: formatTaskDisplayKey(row.projectKey, row.number),
      title: row.title,
      status: row.status,
      priority: row.priority,
      projectId: row.projectId,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
}

/**
 * Expanded inbox: triage capture (`inbox`), On Hold / In Review from any
 * project, and overdue open tasks (due before local today, not completed /
 * canceled / duplicated). Matching is refined on clients by calendar day.
 * Habit day instances and tasks due today or later are excluded
 * (only overdue / undated inbox candidates remain).
 */
export async function listInboxTasks(workspaceId: string, executor: DbExecutor = db) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return executor
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        isNull(tasks.deletedAt),
        isNull(tasks.habitId),
        or(isNull(tasks.dueDate), lt(tasks.dueDate, startOfToday)),
        or(
          eq(tasks.inbox, true),
          inArray(tasks.status, ["on_hold", "in_review"]),
          and(
            isNotNull(tasks.dueDate),
            lt(tasks.dueDate, startOfToday),
            sql`${tasks.status} not in ('completed', 'canceled', 'duplicated')`,
          ),
          and(
            isNotNull(tasks.agentCreatedAt),
            isNull(tasks.agentInboxApprovedAt),
          ),
        ),
      ),
    )
    .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt));
}
