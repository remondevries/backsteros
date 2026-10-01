/**
 * Resolve human keys (OS-45, project `OS`, org `IN`) to internal ids.
 * Used by path params and task-list filters (OS-58). Keep this module free of
 * route/handler concerns so later tasks on the same routes can reuse it.
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { contacts, organizations, projects, tasks } from "../db/schema.js";
import {
  TaskFilterError,
  parseTaskDisplayKey,
  type ParsedTaskListQuery,
} from "./task-filters.js";

export { parseTaskDisplayKey, TASK_DISPLAY_KEY_RE } from "./task-filters.js";
export type { ParsedTaskDisplayKey } from "./task-filters.js";

type DbExecutor = Pick<typeof db, "select">;

export async function resolveTaskRef(
  workspaceId: string,
  ref: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const [byId] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.id, trimmed),
        isNull(tasks.deletedAt),
      ),
    )
    .limit(1);
  if (byId) return byId.id;

  const parsed = parseTaskDisplayKey(trimmed);
  if (!parsed) return null;

  if (parsed.projectKey === "INBOX") {
    const [row] = await executor
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          isNull(tasks.projectId),
          eq(tasks.number, parsed.number),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    return row?.id ?? null;
  }

  const [row] = await executor
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(
      projects,
      and(
        eq(projects.id, tasks.projectId),
        eq(projects.workspaceId, tasks.workspaceId),
      ),
    )
    .where(
      and(
        eq(tasks.workspaceId, workspaceId),
        eq(tasks.number, parsed.number),
        sql`lower(${projects.key}) = ${parsed.projectKey.toLowerCase()}`,
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function resolveProjectRef(
  workspaceId: string,
  ref: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const [byId] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, trimmed),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (byId) return byId.id;

  const [byKey] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        sql`lower(${projects.key}) = ${trimmed.toLowerCase()}`,
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return byKey?.id ?? null;
}

export async function resolveOrganizationRef(
  workspaceId: string,
  ref: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const [byId] = await executor
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, trimmed),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  if (byId) return byId.id;

  const [byKey] = await executor
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        sql`lower(${organizations.key}) = ${trimmed.toLowerCase()}`,
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  return byKey?.id ?? null;
}

export async function resolveContactRef(
  workspaceId: string,
  ref: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const [byId] = await executor
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, trimmed),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (byId) return byId.id;

  const [byKey] = await executor
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        sql`lower(${contacts.key}) = ${trimmed.toLowerCase()}`,
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  return byKey?.id ?? null;
}

async function resolveRefList(
  refs: string[],
  resolveOne: (ref: string) => Promise<string | null>,
  field: string,
  unknownLabel: string,
  strict: boolean,
): Promise<string[]> {
  const out: string[] = [];
  for (const ref of refs) {
    const id = await resolveOne(ref);
    if (id) {
      out.push(id);
      continue;
    }
    if (strict) {
      throw new TaskFilterError(`Unknown ${unknownLabel}`, field);
    }
    out.push(ref);
  }
  return [...new Set(out)];
}

/**
 * Resolve project/assignee/contact/org filter refs to ids.
 * When `strict` (paginated mode), unknown refs → 400 TaskFilterError.
 */
export async function resolveTaskListFilterRefs(
  workspaceId: string,
  filters: ParsedTaskListQuery,
  options: { strict: boolean; executor?: DbExecutor } = { strict: true },
): Promise<ParsedTaskListQuery> {
  const executor = options.executor ?? db;
  const strict = options.strict;

  const projectIds = await resolveRefList(
    filters.projectIds,
    (ref) => resolveProjectRef(workspaceId, ref, executor),
    "projectId",
    "project",
    strict,
  );
  const assigneeIds = await resolveRefList(
    filters.assigneeIds,
    (ref) => resolveContactRef(workspaceId, ref, executor),
    "assigneeId",
    "assignee",
    strict,
  );
  const contactIds = await resolveRefList(
    filters.contactIds,
    (ref) => resolveContactRef(workspaceId, ref, executor),
    "contactId",
    "contact",
    strict,
  );
  const relatedContactIds = await resolveRefList(
    filters.relatedContactIds,
    (ref) => resolveContactRef(workspaceId, ref, executor),
    "relatedContactId",
    "contact",
    strict,
  );
  const relatedOrganizationIds = await resolveRefList(
    filters.relatedOrganizationIds,
    (ref) => resolveOrganizationRef(workspaceId, ref, executor),
    "relatedOrganizationId",
    "organization",
    strict,
  );

  return {
    ...filters,
    projectIds,
    assigneeIds,
    contactIds,
    relatedContactIds,
    relatedOrganizationIds,
  };
}
