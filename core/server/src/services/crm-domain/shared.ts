import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  contacts,
  entityCounters,
  letters,
  organizations,
  projects,
} from "../../db/schema.js";
export type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

async function nextEntityNumber(
  workspaceId: string,
  entity: "organization" | "contact" | "letter",
  executor: DbExecutor = db,
) {
  const table =
    entity === "organization"
      ? organizations
      : entity === "contact"
        ? contacts
        : letters;
  const [maxRow] = await executor
    .select({
      maxNumber: sql<number>`coalesce(max(${table.number}), 0)`,
    })
    .from(table)
    .where(
      and(eq(table.workspaceId, workspaceId), isNull(table.deletedAt)),
    );
  const minNext = Number(maxRow?.maxNumber ?? 0) + 1;

  const [counter] = await executor
    .insert(entityCounters)
    .values({
      workspaceId,
      entity,
      scopeId: "__workspace__",
      nextValue: minNext + 1,
    })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: sql`greatest(${entityCounters.nextValue}, ${minNext}) + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ nextValue: entityCounters.nextValue });
  return counter!.nextValue - 1;
}

async function entityNumberTaken(
  workspaceId: string,
  entity: "organization" | "contact" | "letter",
  number: number,
  executor: DbExecutor = db,
  exceptId?: string,
) {
  const table =
    entity === "organization"
      ? organizations
      : entity === "contact"
        ? contacts
        : letters;
  const conditions = [
    eq(table.workspaceId, workspaceId),
    eq(table.number, number),
    isNull(table.deletedAt),
  ];
  if (exceptId) {
    conditions.push(ne(table.id, exceptId));
  }
  const [row] = await executor
    .select({ id: table.id })
    .from(table)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/** Prefer an explicit number only when it is free; otherwise allocate. */
export async function resolveEntityNumber(
  workspaceId: string,
  entity: "organization" | "contact" | "letter",
  requested: number | null | undefined,
  executor: DbExecutor = db,
) {
  if (
    requested != null &&
    Number.isFinite(requested) &&
    requested > 0 &&
    !(await entityNumberTaken(workspaceId, entity, requested, executor))
  ) {
    return requested;
  }
  return nextEntityNumber(workspaceId, entity, executor);
}

export async function organizationExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, id),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function contactExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, id),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function projectExists(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return Boolean(row);
}
