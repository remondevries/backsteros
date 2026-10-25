import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db/index.js";
import { areas, contacts, habits, organizations, projects } from "../../db/schema.js";
export type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

export async function assertWorkspaceReference(
  workspaceId: string,
  id: string | null | undefined,
  table:
    | typeof organizations
    | typeof areas
    | typeof contacts
    | typeof habits,
  code: string,
  executor: DbExecutor,
) {
  if (!id) return;
  const [row] = await executor
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(table.id, id), isNull(table.deletedAt)))
    .limit(1);
  if (!row) throw new Error(code);
}

export async function contactDisplayName(
  workspaceId: string,
  contactId: string | null | undefined,
  executor: DbExecutor,
): Promise<string | null> {
  if (!contactId) return null;
  const [row] = await executor
    .select({ name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const name = row.name?.trim();
  if (name) return name;
  const email = row.email?.trim();
  return email || null;
}

export async function projectDisplayName(
  workspaceId: string,
  projectId: string | null | undefined,
  executor: DbExecutor,
): Promise<string | null> {
  if (!projectId) return null;
  const [row] = await executor
    .select({ name: projects.name, key: projects.key })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.id, projectId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const name = row.name?.trim();
  if (name) return name;
  const key = row.key?.trim();
  return key || null;
}

export function dueDateIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

export function normalizeRelatedContactIds(
  value: readonly string[] | null | undefined,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function relatedContactIdsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export async function assertRelatedContactIds(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
) {
  for (const id of ids) {
    await assertWorkspaceReference(
      workspaceId,
      id,
      contacts,
      "RELATED_CONTACT_NOT_FOUND",
      executor,
    );
  }
}

export async function relatedContactDisplayNames(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
): Promise<string[]> {
  const names: string[] = [];
  for (const id of ids) {
    const name = await contactDisplayName(workspaceId, id, executor);
    if (name) names.push(name);
  }
  return names;
}

export function normalizeRelatedOrganizationIds(
  value: readonly string[] | null | undefined,
): string[] {
  return normalizeRelatedContactIds(value);
}

export function relatedOrganizationIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return relatedContactIdsEqual(a, b);
}

export function normalizeLinkedEmailIds(
  value: readonly string[] | null | undefined,
): string[] {
  return normalizeRelatedContactIds(value);
}

function linkedEmailIdsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return relatedContactIdsEqual(a, b);
}
void linkedEmailIdsEqual;

export async function assertRelatedOrganizationIds(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
) {
  for (const id of ids) {
    await assertWorkspaceReference(
      workspaceId,
      id,
      organizations,
      "RELATED_ORGANIZATION_NOT_FOUND",
      executor,
    );
  }
}

async function organizationDisplayName(
  workspaceId: string,
  organizationId: string | null | undefined,
  executor: DbExecutor,
): Promise<string | null> {
  if (!organizationId) return null;
  const [row] = await executor
    .select({ name: organizations.name })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const name = row.name?.trim();
  return name || null;
}

export async function relatedOrganizationDisplayNames(
  workspaceId: string,
  ids: readonly string[],
  executor: DbExecutor,
): Promise<string[]> {
  const names: string[] = [];
  for (const id of ids) {
    const name = await organizationDisplayName(workspaceId, id, executor);
    if (name) names.push(name);
  }
  return names;
}
