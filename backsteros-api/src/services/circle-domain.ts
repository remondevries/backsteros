import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  areas,
  avatars,
  contacts,
  documents,
  entityCounters,
  letters,
  mentions,
  organizations,
  projects,
  tasks,
  workspaceSettings,
} from "../db/schema.js";
import { newId } from "../lib/crypto.js";
import {
  assertPrivateStorageKey,
  buildPrivateStorageKey,
  checksumForContent,
  getObject,
  putObject,
} from "../lib/storage.js";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

type OrganizationInput = {
  number?: number | null;
  key: string;
  name: string;
  summary?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  avatarStorageKey?: string | null;
  avatarContentType?: string | null;
  sortOrder?: number;
  notes?: string | null;
};
type ContactInput = {
  number?: number | null;
  key: string;
  organizationId?: string | null;
  name: string;
  email?: string | null;
  title?: string | null;
  summary?: string | null;
  avatarStorageKey?: string | null;
  avatarContentType?: string | null;
  sortOrder?: number;
  phone?: string | null;
  role?: string | null;
  notes?: string | null;
};
type AreaInput = {
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
};
type LetterInput = {
  number?: number | null;
  projectId?: string | null;
  organizationId?: string | null;
  contactId?: string | null;
  title: string;
  icon?: string | null;
  context?: string | null;
  status?: string;
  dueDate?: string | null;
  receivedDate?: string | null;
  direction?: string;
  originalFilename?: string;
  extractedText?: string | null;
  sortOrder?: number;
};

async function nextEntityNumber(
  workspaceId: string,
  entity: string,
  executor: DbExecutor = db,
) {
  const [counter] = await executor
    .insert(entityCounters)
    .values({ workspaceId, entity, scopeId: "__workspace__", nextValue: 2 })
    .onConflictDoUpdate({
      target: [
        entityCounters.workspaceId,
        entityCounters.entity,
        entityCounters.scopeId,
      ],
      set: {
        nextValue: sql`${entityCounters.nextValue} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ nextValue: entityCounters.nextValue });
  return counter!.nextValue - 1;
}

async function organizationExists(
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

async function contactExists(
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

async function projectExists(
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

export function listOrganizations(workspaceId: string) {
  return db
    .select()
    .from(organizations)
    .where(and(eq(organizations.workspaceId, workspaceId), isNull(organizations.deletedAt)))
    .orderBy(organizations.sortOrder, organizations.name);
}

export async function createOrganization(
  workspaceId: string,
  input: OrganizationInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const number = input.number ?? (await nextEntityNumber(workspaceId, "organization", executor));
  const [row] = await executor
    .insert(organizations)
    .values({ id, workspaceId, ...input, number })
    .returning();
  return row!;
}

export async function getOrganizationById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, id),
        isNull(organizations.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getOrganizationRelations(workspaceId: string, id: string) {
  const organization = await getOrganizationById(workspaceId, id);
  if (!organization) return null;
  const [contactRows, projectRows, letterRows] = await Promise.all([
    listContacts(workspaceId, { organizationId: id }),
    db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.organizationId, id), isNull(projects.deletedAt))),
    listLetters(workspaceId, { organizationId: id }),
  ]);
  return { organization, contacts: contactRows, projects: projectRows, letters: letterRows };
}

export async function updateOrganization(
  workspaceId: string,
  id: string,
  input: Partial<OrganizationInput>,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(organizations)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, id),
        isNull(organizations.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteOrganization(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(organizations)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(organizations.workspaceId, workspaceId),
        eq(organizations.id, id),
        isNull(organizations.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export function listContacts(
  workspaceId: string,
  filters: { organizationId?: string; q?: string } = {},
) {
  const conditions = [
    eq(contacts.workspaceId, workspaceId),
    isNull(contacts.deletedAt),
  ];
  if (filters.organizationId) conditions.push(eq(contacts.organizationId, filters.organizationId));
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(or(ilike(contacts.name, pattern), ilike(contacts.email, pattern))!);
  }
  return db.select().from(contacts).where(and(...conditions)).orderBy(contacts.sortOrder, contacts.name);
}

export async function createContact(
  workspaceId: string,
  input: ContactInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  const number = input.number ?? (await nextEntityNumber(workspaceId, "contact", executor));
  const [row] = await executor
    .insert(contacts)
    .values({ id, workspaceId, ...input, number })
    .returning();
  return row!;
}

export async function getContactById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id), isNull(contacts.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getContactRelations(workspaceId: string, id: string) {
  const contact = await getContactById(workspaceId, id);
  if (!contact) return null;
  const [organization, taskRows, letterRows] = await Promise.all([
    contact.organizationId ? getOrganizationById(workspaceId, contact.organizationId) : null,
    db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), or(eq(tasks.contactId, id), eq(tasks.assigneeId, id)), isNull(tasks.deletedAt))),
    listLetters(workspaceId, { contactId: id }),
  ]);
  return { contact, organization, tasks: taskRows, letters: letterRows };
}

export async function getProjectRelations(workspaceId: string, id: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return null;
  const [organization, taskRows, documentRows, letterRows] = await Promise.all([
    project.organizationId ? getOrganizationById(workspaceId, project.organizationId) : null,
    db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.projectId, id), isNull(tasks.deletedAt))),
    db.select().from(documents).where(and(eq(documents.workspaceId, workspaceId), eq(documents.projectId, id), isNull(documents.deletedAt))),
    listLetters(workspaceId, { projectId: id }),
  ]);
  return { project, organization, tasks: taskRows, documents: documentRows, letters: letterRows };
}

export async function getTaskRelations(workspaceId: string, id: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!task) return null;
  const [project, contact, assignee] = await Promise.all([
    task.projectId
      ? db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, task.projectId), isNull(projects.deletedAt))).limit(1).then(([row]) => row ?? null)
      : null,
    task.contactId ? getContactById(workspaceId, task.contactId) : null,
    task.assigneeId ? getContactById(workspaceId, task.assigneeId) : null,
  ]);
  return { task, project, contact, assignee };
}

export async function updateContact(
  workspaceId: string,
  id: string,
  input: Partial<ContactInput>,
  executor: DbExecutor = db,
) {
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  const [row] = await executor
    .update(contacts)
    .set({ ...input, updatedAt: new Date() })
    .where(
      and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id), isNull(contacts.deletedAt)),
    )
    .returning();
  return row ?? null;
}

export async function deleteContact(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(contacts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, id), isNull(contacts.deletedAt)),
    )
    .returning();
  return row ?? null;
}

export function listAreas(workspaceId: string) {
  return db
    .select()
    .from(areas)
    .where(and(eq(areas.workspaceId, workspaceId), isNull(areas.deletedAt)))
    .orderBy(areas.sortOrder, areas.name);
}

export async function createArea(workspaceId: string, input: AreaInput) {
  const [row] = await db
    .insert(areas)
    .values({ id: newId(), workspaceId, ...input })
    .returning();
  return row!;
}

export async function getAreaById(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(areas)
    .where(and(eq(areas.workspaceId, workspaceId), eq(areas.id, id), isNull(areas.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function updateArea(workspaceId: string, id: string, input: Partial<AreaInput>) {
  const [row] = await db
    .update(areas)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(areas.workspaceId, workspaceId), eq(areas.id, id), isNull(areas.deletedAt)))
    .returning();
  return row ?? null;
}

export async function deleteArea(workspaceId: string, id: string) {
  const [row] = await db
    .update(areas)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(areas.workspaceId, workspaceId), eq(areas.id, id), isNull(areas.deletedAt)))
    .returning();
  return row ?? null;
}

export function listLetters(
  workspaceId: string,
  filters: {
    projectId?: string;
    organizationId?: string;
    contactId?: string;
    status?: string;
    triage?: boolean;
  } = {},
) {
  const conditions = [eq(letters.workspaceId, workspaceId), isNull(letters.deletedAt)];
  if (filters.projectId) conditions.push(eq(letters.projectId, filters.projectId));
  if (filters.organizationId) conditions.push(eq(letters.organizationId, filters.organizationId));
  if (filters.contactId) conditions.push(eq(letters.contactId, filters.contactId));
  if (filters.status) conditions.push(eq(letters.status, filters.status));
  if (filters.triage) conditions.push(eq(letters.status, "triage"));
  return db
    .select()
    .from(letters)
    .where(and(...conditions))
    .orderBy(asc(letters.sortOrder), desc(letters.receivedDate), desc(letters.updatedAt));
}

export async function createLetter(
  workspaceId: string,
  input: LetterInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  if (input.projectId && !(await projectExists(workspaceId, input.projectId, executor))) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  if (input.contactId && !(await contactExists(workspaceId, input.contactId, executor))) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  const number = input.number ?? (await nextEntityNumber(workspaceId, "letter", executor));
  const [row] = await executor
    .insert(letters)
    .values({
      id,
      workspaceId,
      ...input,
      number,
      status: input.status ?? (input.direction !== "outgoing" ? "triage" : "ready_to_start"),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      receivedDate: input.receivedDate ? new Date(input.receivedDate) : null,
      originalFilename: input.originalFilename ?? "",
    })
    .returning();
  return row!;
}

export async function getLetterById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(letters)
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getLetterRelations(workspaceId: string, id: string) {
  const letter = await getLetterById(workspaceId, id);
  if (!letter) return null;
  const [project, organization, contact] = await Promise.all([
    letter.projectId
      ? db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, letter.projectId), isNull(projects.deletedAt))).limit(1).then(([row]) => row ?? null)
      : null,
    letter.organizationId ? getOrganizationById(workspaceId, letter.organizationId) : null,
    letter.contactId ? getContactById(workspaceId, letter.contactId) : null,
  ]);
  return { letter, project, organization, contact };
}

export async function updateLetter(
  workspaceId: string,
  id: string,
  input: Partial<LetterInput>,
  executor: DbExecutor = db,
) {
  if (input.projectId && !(await projectExists(workspaceId, input.projectId, executor))) {
    throw new Error("PROJECT_NOT_FOUND");
  }
  if (
    input.organizationId &&
    !(await organizationExists(workspaceId, input.organizationId, executor))
  ) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }
  if (input.contactId && !(await contactExists(workspaceId, input.contactId, executor))) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  const [row] = await executor
    .update(letters)
    .set({
      ...input,
      dueDate:
        input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
      receivedDate:
        input.receivedDate === undefined
          ? undefined
          : input.receivedDate
            ? new Date(input.receivedDate)
            : null,
      updatedAt: new Date(),
    })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .returning();
  return row ?? null;
}

export async function triageLetter(
  workspaceId: string,
  id: string,
  input: {
    projectId?: string | null;
    organizationId?: string | null;
    contactId?: string | null;
    status?: string;
    dueDate?: string | null;
  },
) {
  return updateLetter(workspaceId, id, {
    ...input,
    status: input.status ?? "ready_to_start",
  });
}

export async function deleteLetter(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(letters)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .returning();
  return row ?? null;
}

export async function putLetterPdf(
  workspaceId: string,
  id: string,
  bytes: Uint8Array,
  fileName: string,
) {
  const [letter] = await db
    .select()
    .from(letters)
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .limit(1);
  if (!letter) return null;
  const key = buildPrivateStorageKey(workspaceId, "pdfs", id, fileName || "letter.pdf");
  const stored = await putObject(key, bytes, "application/pdf");
  const [row] = await db
    .update(letters)
    .set({
      storageKey: key,
      originalFilename: fileName || "letter.pdf",
      contentType: "application/pdf",
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
      updatedAt: new Date(),
    })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id)))
    .returning();
  return row ?? null;
}

export async function getLetterPdf(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(letters)
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, id), isNull(letters.deletedAt)))
    .limit(1);
  if (!row?.storageKey) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  const object = await getObject(row.storageKey);
  return { row, bytes: object.bytes };
}

export async function putAvatar(
  workspaceId: string,
  entityType: string,
  entityId: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const id = newId();
  const key = buildPrivateStorageKey(workspaceId, "avatars", entityId, "avatar");
  const stored = await putObject(key, bytes, contentType);
  const [row] = await db
    .insert(avatars)
    .values({
      id,
      workspaceId,
      entityType,
      entityId,
      storageKey: key,
      contentType,
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
    })
    .onConflictDoUpdate({
      target: [avatars.workspaceId, avatars.entityType, avatars.entityId],
      set: {
        storageKey: key,
        contentType,
        byteSize: stored.byteSize,
        checksum: checksumForContent(bytes),
        contentEtag: stored.etag,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (entityType === "organization") {
    await db
      .update(organizations)
      .set({ avatarStorageKey: key, avatarContentType: contentType, updatedAt: new Date() })
      .where(and(eq(organizations.workspaceId, workspaceId), eq(organizations.id, entityId)));
  } else if (entityType === "contact") {
    await db
      .update(contacts)
      .set({ avatarStorageKey: key, avatarContentType: contentType, updatedAt: new Date() })
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, entityId)));
  }
  return row!;
}

export async function getAvatar(workspaceId: string, entityType: string, entityId: string) {
  const [row] = await db
    .select()
    .from(avatars)
    .where(
      and(
        eq(avatars.workspaceId, workspaceId),
        eq(avatars.entityType, entityType),
        eq(avatars.entityId, entityId),
      ),
    )
    .limit(1);
  if (!row) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  const object = await getObject(row.storageKey);
  return { row, bytes: object.bytes };
}

export async function getSettings(workspaceId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  return row?.settings ?? {};
}

export async function updateSettings(
  workspaceId: string,
  patch: Record<string, unknown>,
  executor: DbExecutor = db,
) {
  const current = await getSettings(workspaceId, executor);
  const [row] = await executor
    .insert(workspaceSettings)
    .values({ workspaceId, settings: { ...current, ...patch } })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { settings: { ...current, ...patch }, updatedAt: new Date() },
    })
    .returning();
  return row!.settings;
}

export function listMentions(workspaceId: string, userId?: string | null) {
  const conditions = [eq(mentions.workspaceId, workspaceId)];
  if (userId) conditions.push(eq(mentions.userId, userId));
  return db.select().from(mentions).where(and(...conditions)).orderBy(desc(mentions.createdAt));
}

export async function createMention(
  workspaceId: string,
  input: { userId?: string | null; sourceType: string; sourceId: string; excerpt?: string },
) {
  const [row] = await db
    .insert(mentions)
    .values({ id: newId(), workspaceId, ...input })
    .returning();
  return row!;
}

export async function markMentionRead(workspaceId: string, id: string) {
  const [row] = await db
    .update(mentions)
    .set({ readAt: new Date() })
    .where(and(eq(mentions.workspaceId, workspaceId), eq(mentions.id, id)))
    .returning();
  return row ?? null;
}

export async function globalSearch(workspaceId: string, q: string, limit = 20) {
  const pattern = `%${q}%`;
  const [projectRows, taskRows, documentRows, organizationRows, contactRows, letterRows] =
    await Promise.all([
      db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt), or(ilike(projects.name, pattern), ilike(projects.summary, pattern)))).limit(limit),
      db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.deletedAt), or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)))).limit(limit),
      db.select().from(documents).where(and(eq(documents.workspaceId, workspaceId), isNull(documents.deletedAt), or(ilike(documents.title, pattern), ilike(documents.path, pattern), ilike(documents.snippet, pattern)))).limit(limit),
      db.select().from(organizations).where(and(eq(organizations.workspaceId, workspaceId), isNull(organizations.deletedAt), ilike(organizations.name, pattern))).limit(limit),
      db.select().from(contacts).where(and(eq(contacts.workspaceId, workspaceId), isNull(contacts.deletedAt), or(ilike(contacts.name, pattern), ilike(contacts.email, pattern)))).limit(limit),
      db.select().from(letters).where(and(eq(letters.workspaceId, workspaceId), isNull(letters.deletedAt), ilike(letters.title, pattern))).limit(limit),
    ]);
  return [
    ...projectRows.map((row) => ({ type: "project", id: row.id, title: row.name, snippet: row.summary, updatedAt: row.updatedAt })),
    ...taskRows.map((row) => ({ type: "task", id: row.id, title: row.title, snippet: row.description, updatedAt: row.updatedAt })),
    ...documentRows.map((row) => ({ type: "document", id: row.id, title: row.title, snippet: row.snippet, updatedAt: row.updatedAt })),
    ...organizationRows.map((row) => ({ type: "organization", id: row.id, title: row.name, snippet: row.summary, updatedAt: row.updatedAt })),
    ...contactRows.map((row) => ({ type: "contact", id: row.id, title: row.name, snippet: row.email, updatedAt: row.updatedAt })),
    ...letterRows.map((row) => ({ type: "letter", id: row.id, title: row.title, snippet: row.context, updatedAt: row.updatedAt })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)
    .map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}
