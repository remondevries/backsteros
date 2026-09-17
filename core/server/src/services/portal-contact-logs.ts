import type {
  CreatePortalContactLogInput,
  PortalContactLog,
  PortalContactLogKind,
} from "@backsteros/contracts";
import { and, desc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { contactPortalLogs, projects } from "../db/schema.js";
import { newId } from "../lib/crypto.js";

type DbExecutor = Pick<typeof db, "select" | "insert">;

function toIso(value: Date): string {
  return value.toISOString();
}

function mapRow(
  row: typeof contactPortalLogs.$inferSelect,
  project?: { name: string; key: string | null } | null,
): PortalContactLog {
  return {
    id: row.id,
    contactId: row.contactId,
    kind: row.kind as PortalContactLogKind,
    projectId: row.projectId,
    projectName: project?.name ?? null,
    projectKey: project?.key ?? null,
    occurredAt: toIso(row.occurredAt),
    createdAt: toIso(row.createdAt),
  };
}

export async function appendPortalContactLog(
  workspaceId: string,
  contactId: string,
  input: CreatePortalContactLogInput,
  executor: DbExecutor = db,
): Promise<PortalContactLog> {
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : new Date();
  const [row] = await executor
    .insert(contactPortalLogs)
    .values({
      id: newId(),
      workspaceId,
      contactId,
      kind: input.kind,
      projectId: input.projectId ?? null,
      occurredAt,
    })
    .returning();

  let project: { name: string; key: string | null } | null = null;
  if (row.projectId) {
    const [projectRow] = await executor
      .select({ name: projects.name, key: projects.key })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.id, row.projectId),
        ),
      )
      .limit(1);
    project = projectRow ?? null;
  }

  return mapRow(row, project);
}

export async function listPortalContactLogs(
  workspaceId: string,
  contactId: string,
  options?: { limit?: number },
  executor: DbExecutor = db,
): Promise<PortalContactLog[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const rows = await executor
    .select({
      log: contactPortalLogs,
      projectName: projects.name,
      projectKey: projects.key,
    })
    .from(contactPortalLogs)
    .leftJoin(
      projects,
      and(
        eq(projects.id, contactPortalLogs.projectId),
        eq(projects.workspaceId, contactPortalLogs.workspaceId),
      ),
    )
    .where(
      and(
        eq(contactPortalLogs.workspaceId, workspaceId),
        eq(contactPortalLogs.contactId, contactId),
      ),
    )
    .orderBy(desc(contactPortalLogs.occurredAt))
    .limit(limit);

  return rows.map((entry) =>
    mapRow(
      entry.log,
      entry.log.projectId && entry.projectName
        ? { name: entry.projectName, key: entry.projectKey ?? null }
        : null,
    ),
  );
}
