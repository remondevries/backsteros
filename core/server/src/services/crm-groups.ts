import type {
  ContactRelationship,
  ContactRelationshipInput,
  ContactRelationshipListItem,
  ContactRelationshipType,
  CrmGroup,
  CrmGroupInput,
  CrmGroupMember,
  CrmGroupMemberInput,
  CrmGroupSubjectType,
  UpdateContactRelationshipInput,
} from "@backsteros/contracts";
import { and, asc, eq, isNull, or } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  contactRelationships,
  contacts,
  crmGroupMembers,
  crmGroups,
  organizations,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import { relationshipTypeLabel } from "./crm-relationship-labels.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRelationship(
  row: typeof contactRelationships.$inferSelect,
): ContactRelationship {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    fromContactId: row.fromContactId,
    toContactId: row.toContactId,
    type: row.type as ContactRelationshipType,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

function mapGroup(row: typeof crmGroups.$inferSelect): CrmGroup {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

function mapMember(row: typeof crmGroupMembers.$inferSelect): CrmGroupMember {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    groupId: row.groupId,
    subjectType: row.subjectType as CrmGroupSubjectType,
    subjectId: row.subjectId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: toIso(row.deletedAt),
  };
}

async function contactExists(
  workspaceId: string,
  contactId: string,
  executor: DbExecutor,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function organizationExists(
  workspaceId: string,
  organizationId: string,
  executor: DbExecutor,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, organizationId),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listContactRelationships(
  workspaceId: string,
  contactId: string,
  executor: DbExecutor = db,
): Promise<ContactRelationshipListItem[] | null> {
  if (!(await contactExists(workspaceId, contactId, executor))) return null;

  const edges = await executor
    .select()
    .from(contactRelationships)
    .where(
      and(
        eq(contactRelationships.workspaceId, workspaceId),
        isNull(contactRelationships.deletedAt),
        or(
          eq(contactRelationships.fromContactId, contactId),
          eq(contactRelationships.toContactId, contactId),
        ),
      ),
    )
    .orderBy(asc(contactRelationships.createdAt));

  const relatedIds = [
    ...new Set(
      edges.flatMap((edge) => [edge.fromContactId, edge.toContactId]),
    ),
  ];
  const nameRows =
    relatedIds.length === 0
      ? []
      : await executor
          .select({ id: contacts.id, name: contacts.name })
          .from(contacts)
          .where(
            and(
              eq(contacts.workspaceId, workspaceId),
              isNull(contacts.deletedAt),
            ),
          );
  const nameById = new Map(
    nameRows
      .filter((row) => relatedIds.includes(row.id))
      .map((row) => [row.id, row.name]),
  );

  return edges.map((edge) => {
    const outgoing = edge.fromContactId === contactId;
    const direction = outgoing ? ("outgoing" as const) : ("incoming" as const);
    const relatedContactId = outgoing ? edge.toContactId : edge.fromContactId;
    const type = edge.type as ContactRelationshipType;
    return {
      ...mapRelationship(edge),
      direction,
      typeLabel: relationshipTypeLabel(type, direction),
      relatedContactId,
      relatedContactName: nameById.get(relatedContactId) ?? "Unknown",
    } satisfies ContactRelationshipListItem;
  });
}

export async function createContactRelationship(
  workspaceId: string,
  fromContactId: string,
  input: ContactRelationshipInput,
  executor: DbExecutor = db,
): Promise<ContactRelationship> {
  if (!(await contactExists(workspaceId, fromContactId, executor))) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  if (!(await contactExists(workspaceId, input.toContactId, executor))) {
    throw new Error("RELATED_CONTACT_NOT_FOUND");
  }
  if (fromContactId === input.toContactId) {
    throw new Error("SELF_RELATIONSHIP");
  }

  const [existing] = await executor
    .select()
    .from(contactRelationships)
    .where(
      and(
        eq(contactRelationships.workspaceId, workspaceId),
        eq(contactRelationships.fromContactId, fromContactId),
        eq(contactRelationships.toContactId, input.toContactId),
        eq(contactRelationships.type, input.type),
        isNull(contactRelationships.deletedAt),
      ),
    )
    .limit(1);
  if (existing) {
    throw new Error("RELATIONSHIP_EXISTS");
  }

  const [row] = await executor
    .insert(contactRelationships)
    .values({
      id: newId(),
      workspaceId,
      fromContactId,
      toContactId: input.toContactId,
      type: input.type,
      note: input.note ?? null,
    })
    .returning();
  return mapRelationship(row!);
}

export async function updateContactRelationship(
  workspaceId: string,
  id: string,
  input: UpdateContactRelationshipInput,
  executor: DbExecutor = db,
): Promise<ContactRelationship | null> {
  const [row] = await executor
    .update(contactRelationships)
    .set({
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contactRelationships.workspaceId, workspaceId),
        eq(contactRelationships.id, id),
        isNull(contactRelationships.deletedAt),
      ),
    )
    .returning();
  return row ? mapRelationship(row) : null;
}

export async function deleteContactRelationship(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const now = new Date();
  const [row] = await executor
    .update(contactRelationships)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(contactRelationships.workspaceId, workspaceId),
        eq(contactRelationships.id, id),
        isNull(contactRelationships.deletedAt),
      ),
    )
    .returning();
  return Boolean(row);
}

export async function listCrmGroups(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<CrmGroup[]> {
  const rows = await executor
    .select()
    .from(crmGroups)
    .where(
      and(eq(crmGroups.workspaceId, workspaceId), isNull(crmGroups.deletedAt)),
    )
    .orderBy(asc(crmGroups.sortOrder), asc(crmGroups.name));
  return rows.map(mapGroup);
}

export async function getCrmGroupById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<CrmGroup | null> {
  const [row] = await executor
    .select()
    .from(crmGroups)
    .where(
      and(
        eq(crmGroups.workspaceId, workspaceId),
        eq(crmGroups.id, id),
        isNull(crmGroups.deletedAt),
      ),
    )
    .limit(1);
  return row ? mapGroup(row) : null;
}

export async function createCrmGroup(
  workspaceId: string,
  input: CrmGroupInput,
  executor: DbExecutor = db,
): Promise<CrmGroup> {
  const [row] = await executor
    .insert(crmGroups)
    .values({
      id: newId(),
      workspaceId,
      name: input.name.trim(),
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? Date.now(),
    })
    .returning();
  return mapGroup(row!);
}

export async function updateCrmGroup(
  workspaceId: string,
  id: string,
  input: Partial<CrmGroupInput>,
  executor: DbExecutor = db,
): Promise<CrmGroup | null> {
  const [row] = await executor
    .update(crmGroups)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(crmGroups.workspaceId, workspaceId),
        eq(crmGroups.id, id),
        isNull(crmGroups.deletedAt),
      ),
    )
    .returning();
  return row ? mapGroup(row) : null;
}

export async function deleteCrmGroup(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const now = new Date();
  const [row] = await executor
    .update(crmGroups)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(crmGroups.workspaceId, workspaceId),
        eq(crmGroups.id, id),
        isNull(crmGroups.deletedAt),
      ),
    )
    .returning();
  if (!row) return false;
  await executor
    .update(crmGroupMembers)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.groupId, id),
        isNull(crmGroupMembers.deletedAt),
      ),
    );
  return true;
}

export async function listCrmGroupMembers(
  workspaceId: string,
  groupId: string,
  executor: DbExecutor = db,
): Promise<CrmGroupMember[] | null> {
  if (!(await getCrmGroupById(workspaceId, groupId, executor))) return null;
  const rows = await executor
    .select()
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.groupId, groupId),
        isNull(crmGroupMembers.deletedAt),
      ),
    )
    .orderBy(asc(crmGroupMembers.createdAt));
  return rows.map(mapMember);
}

export async function addCrmGroupMember(
  workspaceId: string,
  groupId: string,
  input: CrmGroupMemberInput,
  executor: DbExecutor = db,
): Promise<CrmGroupMember> {
  if (!(await getCrmGroupById(workspaceId, groupId, executor))) {
    throw new Error("GROUP_NOT_FOUND");
  }
  if (input.subjectType === "contact") {
    if (!(await contactExists(workspaceId, input.subjectId, executor))) {
      throw new Error("SUBJECT_NOT_FOUND");
    }
  } else if (
    !(await organizationExists(workspaceId, input.subjectId, executor))
  ) {
    throw new Error("SUBJECT_NOT_FOUND");
  }

  const [existing] = await executor
    .select()
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.groupId, groupId),
        eq(crmGroupMembers.subjectType, input.subjectType),
        eq(crmGroupMembers.subjectId, input.subjectId),
        isNull(crmGroupMembers.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return mapMember(existing);

  const [row] = await executor
    .insert(crmGroupMembers)
    .values({
      id: newId(),
      workspaceId,
      groupId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    })
    .returning();
  return mapMember(row!);
}

export async function removeCrmGroupMember(
  workspaceId: string,
  groupId: string,
  memberId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const now = new Date();
  const [row] = await executor
    .update(crmGroupMembers)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.groupId, groupId),
        eq(crmGroupMembers.id, memberId),
        isNull(crmGroupMembers.deletedAt),
      ),
    )
    .returning();
  return Boolean(row);
}

export async function listCrmGroupsForSubject(
  workspaceId: string,
  subjectType: CrmGroupSubjectType,
  subjectId: string,
  executor: DbExecutor = db,
): Promise<CrmGroup[] | null> {
  if (subjectType === "contact") {
    if (!(await contactExists(workspaceId, subjectId, executor))) return null;
  } else if (!(await organizationExists(workspaceId, subjectId, executor))) {
    return null;
  }

  const memberRows = await executor
    .select({ groupId: crmGroupMembers.groupId })
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.subjectType, subjectType),
        eq(crmGroupMembers.subjectId, subjectId),
        isNull(crmGroupMembers.deletedAt),
      ),
    );
  if (memberRows.length === 0) return [];

  const groupIds = memberRows.map((row) => row.groupId);
  const groups = await listCrmGroups(workspaceId, executor);
  return groups.filter((group) => groupIds.includes(group.id));
}
