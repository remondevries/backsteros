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
import * as crmRelationshipLabelsService from "./crm-relationship-labels.js";

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

  const labels = await crmRelationshipLabelsService.listCrmRelationshipLabels(
    workspaceId,
    executor,
  );

  return edges.map((edge) => {
    const outgoing = edge.fromContactId === contactId;
    const direction = outgoing ? ("outgoing" as const) : ("incoming" as const);
    const relatedContactId = outgoing ? edge.toContactId : edge.fromContactId;
    const type = edge.type as ContactRelationshipType;
    return {
      ...mapRelationship(edge),
      direction,
      typeLabel: relationshipTypeLabel(type, direction, labels),
      relatedContactId,
      relatedContactName: nameById.get(relatedContactId) ?? "Unknown",
    } satisfies ContactRelationshipListItem;
  });
}

export async function getContactRelationshipById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<ContactRelationship | null> {
  const [row] = await executor
    .select()
    .from(contactRelationships)
    .where(
      and(
        eq(contactRelationships.workspaceId, workspaceId),
        eq(contactRelationships.id, id),
        isNull(contactRelationships.deletedAt),
      ),
    )
    .limit(1);
  return row ? mapRelationship(row) : null;
}

export async function createContactRelationship(
  workspaceId: string,
  fromContactId: string,
  input: ContactRelationshipInput,
  entityId?: string,
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
      id: entityId ?? newId(),
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

function normalizeCrmGroupName(name: string): string {
  return name.trim().toLowerCase();
}

export async function findCrmGroupByNormalizedName(
  workspaceId: string,
  name: string,
  executor: DbExecutor = db,
): Promise<CrmGroup | null> {
  const needle = normalizeCrmGroupName(name);
  if (!needle) return null;
  const rows = await listCrmGroups(workspaceId, executor);
  return (
    rows.find((group) => normalizeCrmGroupName(group.name) === needle) ?? null
  );
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
  entityId?: string,
  executor: DbExecutor = db,
): Promise<CrmGroup> {
  const existingByName = await findCrmGroupByNormalizedName(
    workspaceId,
    input.name,
    executor,
  );
  if (existingByName) {
    return existingByName;
  }

  const [row] = await executor
    .insert(crmGroups)
    .values({
      id: entityId ?? newId(),
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
  // Heal org↔contact membership drift (non-prod safe; idempotent).
  await materializeCrmGroupMembershipCascade(workspaceId, groupId, executor);
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

export async function getCrmGroupMemberById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
): Promise<CrmGroupMember | null> {
  const [row] = await executor
    .select()
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.id, id),
        isNull(crmGroupMembers.deletedAt),
      ),
    )
    .limit(1);
  return row ? mapMember(row) : null;
}

async function listContactIdsForOrganization(
  workspaceId: string,
  organizationId: string,
  executor: DbExecutor,
): Promise<string[]> {
  const rows = await executor
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.organizationId, organizationId),
        isNull(contacts.deletedAt),
      ),
    );
  return rows.map((row) => row.id);
}

async function getContactOrganizationId(
  workspaceId: string,
  contactId: string,
  executor: DbExecutor,
): Promise<string | null> {
  const [row] = await executor
    .select({ organizationId: contacts.organizationId })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.id, contactId),
        isNull(contacts.deletedAt),
      ),
    )
    .limit(1);
  return row?.organizationId ?? null;
}

/**
 * Subjects that should share a CRM group label when `input` is added:
 * - organization → org + every contact at that org
 * - contact with organizationId → contact + org + sibling contacts
 * - contact without org → contact only
 */
export async function planCrmGroupMembershipCascade(
  workspaceId: string,
  input: CrmGroupMemberInput,
  executor: DbExecutor = db,
): Promise<CrmGroupMemberInput[]> {
  const planned: CrmGroupMemberInput[] = [
    { subjectType: input.subjectType, subjectId: input.subjectId },
  ];
  const seen = new Set(`${input.subjectType}:${input.subjectId}`);

  const add = (subjectType: CrmGroupSubjectType, subjectId: string) => {
    const key = `${subjectType}:${subjectId}`;
    if (seen.has(key)) return;
    seen.add(key);
    planned.push({ subjectType, subjectId });
  };

  if (input.subjectType === "organization") {
    for (const contactId of await listContactIdsForOrganization(
      workspaceId,
      input.subjectId,
      executor,
    )) {
      add("contact", contactId);
    }
    return planned;
  }

  const organizationId = await getContactOrganizationId(
    workspaceId,
    input.subjectId,
    executor,
  );
  if (!organizationId) return planned;

  add("organization", organizationId);
  for (const contactId of await listContactIdsForOrganization(
    workspaceId,
    organizationId,
    executor,
  )) {
    add("contact", contactId);
  }
  return planned;
}

async function insertCrmGroupMemberRaw(
  workspaceId: string,
  groupId: string,
  input: CrmGroupMemberInput,
  entityId: string | undefined,
  executor: DbExecutor,
): Promise<CrmGroupMember> {
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
      id: entityId ?? newId(),
      workspaceId,
      groupId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    })
    .returning();
  return mapMember(row!);
}

export type CrmGroupMemberAddResult = {
  primary: CrmGroupMember;
  members: CrmGroupMember[];
};

/**
 * Add a CRM group member and keep org↔contact labels in sync:
 * org membership materializes all contacts; contact membership materializes
 * its organization (and sibling contacts).
 */
export async function addCrmGroupMember(
  workspaceId: string,
  groupId: string,
  input: CrmGroupMemberInput,
  entityId?: string,
  executor: DbExecutor = db,
  options?: { cascade?: boolean },
): Promise<CrmGroupMember> {
  const result = await addCrmGroupMemberWithCascade(
    workspaceId,
    groupId,
    input,
    entityId,
    executor,
    options,
  );
  return result.primary;
}

export async function addCrmGroupMemberWithCascade(
  workspaceId: string,
  groupId: string,
  input: CrmGroupMemberInput,
  entityId?: string,
  executor: DbExecutor = db,
  options?: { cascade?: boolean },
): Promise<CrmGroupMemberAddResult> {
  if (!(await getCrmGroupById(workspaceId, groupId, executor))) {
    throw new Error("GROUP_NOT_FOUND");
  }

  const cascade = options?.cascade !== false;
  const planned = cascade
    ? await planCrmGroupMembershipCascade(workspaceId, input, executor)
    : [input];

  const members: CrmGroupMember[] = [];
  let primary: CrmGroupMember | null = null;

  for (const subject of planned) {
    const isPrimary =
      subject.subjectType === input.subjectType &&
      subject.subjectId === input.subjectId;
    const row = await insertCrmGroupMemberRaw(
      workspaceId,
      groupId,
      subject,
      isPrimary ? entityId : undefined,
      executor,
    );
    members.push(row);
    if (isPrimary) primary = row;
  }

  if (!primary) {
    throw new Error("SUBJECT_NOT_FOUND");
  }
  return { primary, members };
}

export type CrmGroupMemberRemoveResult = {
  removed: CrmGroupMember[];
};

/**
 * Soft-delete a membership. Removing an organization also removes that org's
 * contacts from the same group so labels stay aligned.
 */
export async function removeCrmGroupMember(
  workspaceId: string,
  groupId: string,
  memberId: string,
  executor: DbExecutor = db,
  options?: { cascade?: boolean },
): Promise<boolean> {
  const result = await removeCrmGroupMemberWithCascade(
    workspaceId,
    groupId,
    memberId,
    executor,
    options,
  );
  return result.removed.length > 0;
}

export async function removeCrmGroupMemberWithCascade(
  workspaceId: string,
  groupId: string,
  memberId: string,
  executor: DbExecutor = db,
  options?: { cascade?: boolean },
): Promise<CrmGroupMemberRemoveResult> {
  const cascade = options?.cascade !== false;
  const existing = await getCrmGroupMemberById(workspaceId, memberId, executor);
  if (!existing || existing.groupId !== groupId) {
    return { removed: [] };
  }

  const toRemoveIds = new Set<string>([existing.id]);
  if (cascade && existing.subjectType === "organization") {
    const contactIds = await listContactIdsForOrganization(
      workspaceId,
      existing.subjectId,
      executor,
    );
    if (contactIds.length > 0) {
      const rows = await executor
        .select()
        .from(crmGroupMembers)
        .where(
          and(
            eq(crmGroupMembers.workspaceId, workspaceId),
            eq(crmGroupMembers.groupId, groupId),
            eq(crmGroupMembers.subjectType, "contact"),
            isNull(crmGroupMembers.deletedAt),
          ),
        );
      for (const row of rows) {
        if (contactIds.includes(row.subjectId)) {
          toRemoveIds.add(row.id);
        }
      }
    }
  }

  const now = new Date();
  const removed: CrmGroupMember[] = [];
  for (const id of toRemoveIds) {
    const [row] = await executor
      .update(crmGroupMembers)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(crmGroupMembers.workspaceId, workspaceId),
          eq(crmGroupMembers.groupId, groupId),
          eq(crmGroupMembers.id, id),
          isNull(crmGroupMembers.deletedAt),
        ),
      )
      .returning();
    if (row) removed.push(mapMember(row));
  }
  return { removed };
}

/**
 * For every organization member, ensure all of its contacts are members (and
 * the reverse: contact members pull in their organization). Idempotent.
 */
export async function materializeCrmGroupMembershipCascade(
  workspaceId: string,
  groupId: string,
  executor: DbExecutor = db,
): Promise<CrmGroupMember[]> {
  if (!(await getCrmGroupById(workspaceId, groupId, executor))) {
    return [];
  }
  const existing = await executor
    .select()
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.groupId, groupId),
        isNull(crmGroupMembers.deletedAt),
      ),
    );
  if (existing.length === 0) return [];

  const created: CrmGroupMember[] = [];
  const seeds = existing.map((row) => ({
    subjectType: row.subjectType as CrmGroupSubjectType,
    subjectId: row.subjectId,
  }));

  for (const seed of seeds) {
    const planned = await planCrmGroupMembershipCascade(
      workspaceId,
      seed,
      executor,
    );
    for (const subject of planned) {
      const before = existing.find(
        (row) =>
          row.subjectType === subject.subjectType &&
          row.subjectId === subject.subjectId,
      );
      if (before) continue;
      try {
        const row = await insertCrmGroupMemberRaw(
          workspaceId,
          groupId,
          subject,
          undefined,
          executor,
        );
        if (
          !existing.some(
            (entry) =>
              entry.subjectType === row.subjectType &&
              entry.subjectId === row.subjectId,
          ) &&
          !created.some(
            (entry) =>
              entry.subjectType === row.subjectType &&
              entry.subjectId === row.subjectId,
          )
        ) {
          created.push(row);
          existing.push({
            id: row.id,
            workspaceId: row.workspaceId,
            groupId: row.groupId,
            subjectType: row.subjectType,
            subjectId: row.subjectId,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
            deletedAt: null,
          } as (typeof existing)[number]);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "SUBJECT_NOT_FOUND") {
          continue;
        }
        throw error;
      }
    }
  }
  return created;
}

/**
 * When a contact joins (or moves to) an organization, copy that org's CRM group
 * memberships onto the contact so labels stay aligned without a manual toggle.
 */
export async function inheritOrganizationGroupMemberships(
  workspaceId: string,
  contactId: string,
  executor: DbExecutor = db,
): Promise<CrmGroupMember[]> {
  const organizationId = await getContactOrganizationId(
    workspaceId,
    contactId,
    executor,
  );
  if (!organizationId) return [];

  const orgGroups = await executor
    .select({ groupId: crmGroupMembers.groupId })
    .from(crmGroupMembers)
    .where(
      and(
        eq(crmGroupMembers.workspaceId, workspaceId),
        eq(crmGroupMembers.subjectType, "organization"),
        eq(crmGroupMembers.subjectId, organizationId),
        isNull(crmGroupMembers.deletedAt),
      ),
    );

  const added: CrmGroupMember[] = [];
  for (const { groupId } of orgGroups) {
    const row = await insertCrmGroupMemberRaw(
      workspaceId,
      groupId,
      { subjectType: "contact", subjectId: contactId },
      undefined,
      executor,
    );
    added.push(row);
  }
  return added;
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

  const groupIdSet = new Set<string>();

  const direct = await executor
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
  for (const row of direct) groupIdSet.add(row.groupId);

  // Labels stay aligned even if cascade materialization hasn't run yet.
  if (subjectType === "contact") {
    const organizationId = await getContactOrganizationId(
      workspaceId,
      subjectId,
      executor,
    );
    if (organizationId) {
      const viaOrg = await executor
        .select({ groupId: crmGroupMembers.groupId })
        .from(crmGroupMembers)
        .where(
          and(
            eq(crmGroupMembers.workspaceId, workspaceId),
            eq(crmGroupMembers.subjectType, "organization"),
            eq(crmGroupMembers.subjectId, organizationId),
            isNull(crmGroupMembers.deletedAt),
          ),
        );
      for (const row of viaOrg) groupIdSet.add(row.groupId);
    }
  } else {
    const contactIds = await listContactIdsForOrganization(
      workspaceId,
      subjectId,
      executor,
    );
    if (contactIds.length > 0) {
      const viaContacts = await executor
        .select({
          groupId: crmGroupMembers.groupId,
          subjectId: crmGroupMembers.subjectId,
        })
        .from(crmGroupMembers)
        .where(
          and(
            eq(crmGroupMembers.workspaceId, workspaceId),
            eq(crmGroupMembers.subjectType, "contact"),
            isNull(crmGroupMembers.deletedAt),
          ),
        );
      const contactIdSet = new Set(contactIds);
      for (const row of viaContacts) {
        if (contactIdSet.has(row.subjectId)) groupIdSet.add(row.groupId);
      }
    }
  }

  if (groupIdSet.size === 0) return [];
  const groups = await listCrmGroups(workspaceId, executor);
  return groups.filter((group) => groupIdSet.has(group.id));
}

