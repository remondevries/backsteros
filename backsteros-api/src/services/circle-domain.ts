import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  areas,
  avatars,
  contacts,
  documents,
  entityCounters,
  letters,
  letterAttachments,
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
  deleteObject,
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
type ContactSocialAccount = {
  platform: string;
  url: string;
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
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  socialAccounts?: ContactSocialAccount[];
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
    .where(eq(table.workspaceId, workspaceId));
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

export async function listLetterAttachments(workspaceId: string, letterId: string) {
  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;
  return db
    .select()
    .from(letterAttachments)
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .orderBy(asc(letterAttachments.sortOrder), asc(letterAttachments.createdAt));
}

async function syncLetterPrimaryAttachment(
  workspaceId: string,
  letterId: string,
  attachment: typeof letterAttachments.$inferSelect | null,
) {
  await db
    .update(letters)
    .set({
      storageKey: attachment?.storageKey ?? "",
      originalFilename: attachment?.originalFilename ?? "",
      contentType: attachment?.contentType ?? "application/pdf",
      byteSize: attachment?.byteSize ?? 0,
      checksum: attachment?.checksum ?? null,
      contentEtag: attachment?.contentEtag ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, letterId)));
}

export async function createLetterAttachment(
  workspaceId: string,
  letterId: string,
  bytes: Uint8Array,
  fileName: string,
) {
  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;

  const attachmentId = newId();
  const key = buildPrivateStorageKey(
    workspaceId,
    "pdfs",
    attachmentId,
    fileName || "letter.pdf",
  );
  const stored = await putObject(key, bytes, "application/pdf");
  const [attachment] = await db
    .insert(letterAttachments)
    .values({
      id: attachmentId,
      workspaceId,
      letterId,
      storageKey: key,
      originalFilename: fileName || "letter.pdf",
      contentType: "application/pdf",
      byteSize: stored.byteSize,
      checksum: checksumForContent(bytes),
      contentEtag: stored.etag,
      sortOrder: Date.now(),
    })
    .returning();
  if (!attachment) return null;

  const attachments = await listLetterAttachments(workspaceId, letterId);
  // Keep the first (oldest) attachment as the denormalized primary on `letters`.
  await syncLetterPrimaryAttachment(
    workspaceId,
    letterId,
    attachments?.[0] ?? attachment,
  );
  const updatedLetter = await getLetterById(workspaceId, letterId);
  return { letter: updatedLetter!, attachment };
}

/** @deprecated Prefer createLetterAttachment — still adds a PDF (no longer replaces). */
export async function putLetterPdf(
  workspaceId: string,
  id: string,
  bytes: Uint8Array,
  fileName: string,
) {
  const result = await createLetterAttachment(workspaceId, id, bytes, fileName);
  return result?.letter ?? null;
}

export async function getLetterAttachment(
  workspaceId: string,
  letterId: string,
  attachmentId: string,
) {
  const [row] = await db
    .select()
    .from(letterAttachments)
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.storageKey) return null;
  assertPrivateStorageKey(workspaceId, row.storageKey);
  const object = await getObject(row.storageKey);
  return { row, bytes: object.bytes };
}

export async function getLetterPdf(workspaceId: string, id: string) {
  const attachments = await listLetterAttachments(workspaceId, id);
  if (!attachments) return null;
  const primary = attachments[0];
  if (primary) {
    return getLetterAttachment(workspaceId, id, primary.id);
  }

  // Legacy fallback for letters not yet backfilled.
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

export async function deleteLetterAttachment(
  workspaceId: string,
  letterId: string,
  attachmentId: string,
) {
  const [row] = await db
    .update(letterAttachments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  const remaining = await listLetterAttachments(workspaceId, letterId);
  await syncLetterPrimaryAttachment(
    workspaceId,
    letterId,
    remaining?.[0] ?? null,
  );
  return row;
}

export async function updateLetterAttachment(
  workspaceId: string,
  letterId: string,
  attachmentId: string,
  input: { originalFilename: string },
) {
  const filename = input.originalFilename.trim();
  if (!filename) return null;

  const [row] = await db
    .update(letterAttachments)
    .set({
      originalFilename: filename,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.letterId, letterId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  const attachments = await listLetterAttachments(workspaceId, letterId);
  const primary = attachments?.[0];
  if (primary?.id === attachmentId) {
    await syncLetterPrimaryAttachment(workspaceId, letterId, row);
  }
  return row;
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

export async function deleteAvatar(
  workspaceId: string,
  entityType: string,
  entityId: string,
) {
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
  try {
    await deleteObject(row.storageKey);
  } catch {
    // Continue clearing DB even if object storage delete fails.
  }

  await db
    .delete(avatars)
    .where(
      and(
        eq(avatars.workspaceId, workspaceId),
        eq(avatars.entityType, entityType),
        eq(avatars.entityId, entityId),
      ),
    );

  if (entityType === "organization") {
    await db
      .update(organizations)
      .set({
        avatarStorageKey: null,
        avatarContentType: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizations.workspaceId, workspaceId),
          eq(organizations.id, entityId),
        ),
      );
  } else if (entityType === "contact") {
    await db
      .update(contacts)
      .set({
        avatarStorageKey: null,
        avatarContentType: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(contacts.workspaceId, workspaceId), eq(contacts.id, entityId)),
      );
  }

  return row;
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

export type GlobalSearchMode =
  | "all"
  | "projects"
  | "tasks"
  | "documents"
  | "letters"
  | "knowledge"
  | "contacts"
  | "organizations";

export type GlobalSearchScope = {
  taskProjectId?: string;
  taskContactId?: string;
  taskInboxOnly?: boolean;
  documentProjectId?: string;
  letterProjectId?: string;
  letterContactId?: string;
  letterOrganizationId?: string;
  projectOrganizationId?: string;
  contactOrganizationId?: string;
  includeProjects: boolean;
  includeTasks: boolean;
  includeDocuments: boolean;
  includeLetters: boolean;
  includeKnowledgeDocuments: boolean;
  includeContacts: boolean;
  includeOrganizations: boolean;
};

function scopeForMode(mode: GlobalSearchMode): GlobalSearchScope {
  const empty = {
    includeProjects: false,
    includeTasks: false,
    includeDocuments: false,
    includeLetters: false,
    includeKnowledgeDocuments: false,
    includeContacts: false,
    includeOrganizations: false,
  };

  switch (mode) {
    case "projects":
      return { ...empty, includeProjects: true };
    case "tasks":
      return { ...empty, includeTasks: true };
    case "documents":
      return { ...empty, includeDocuments: true };
    case "letters":
      return { ...empty, includeLetters: true };
    case "knowledge":
      return { ...empty, includeKnowledgeDocuments: true };
    case "contacts":
      return { ...empty, includeContacts: true };
    case "organizations":
      return { ...empty, includeOrganizations: true };
    default:
      return {
        includeProjects: true,
        includeTasks: true,
        includeDocuments: true,
        includeLetters: true,
        includeKnowledgeDocuments: true,
        includeContacts: true,
        includeOrganizations: true,
      };
  }
}

function scopeFromContextParams(input: {
  contextKind: string | null;
  projectId: string | null;
  projectSection: string | null;
  contactId: string | null;
  contactSection: string | null;
  organizationId: string | null;
  organizationSection: string | null;
}): GlobalSearchScope | null {
  const empty = {
    includeProjects: false,
    includeTasks: false,
    includeDocuments: false,
    includeLetters: false,
    includeKnowledgeDocuments: false,
    includeContacts: false,
    includeOrganizations: false,
  };

  const kind = input.contextKind;
  if (!kind) return null;

  switch (kind) {
    case "inbox":
      return { ...empty, taskInboxOnly: true, includeTasks: true };
    case "tasks":
      return { ...empty, includeTasks: true };
    case "knowledge":
      return { ...empty, includeKnowledgeDocuments: true };
    case "letters":
      return { ...empty, includeLetters: true };
    case "contacts":
      return { ...empty, includeContacts: true };
    case "organizations":
      return { ...empty, includeOrganizations: true };
    case "projects":
      return { ...empty, includeProjects: true };
    case "project": {
      const projectId = input.projectId;
      if (!projectId) return { ...empty, includeProjects: true };
      const section = input.projectSection ?? "overview";
      if (section === "documents") {
        return {
          ...empty,
          documentProjectId: projectId,
          includeDocuments: true,
        };
      }
      if (section === "tasks") {
        return { ...empty, taskProjectId: projectId, includeTasks: true };
      }
      if (section === "letters") {
        return { ...empty, letterProjectId: projectId, includeLetters: true };
      }
      return {
        ...empty,
        taskProjectId: projectId,
        documentProjectId: projectId,
        letterProjectId: projectId,
        includeTasks: true,
        includeDocuments: true,
        includeLetters: true,
      };
    }
    case "contact": {
      const contactId = input.contactId;
      if (!contactId) return { ...empty, includeContacts: true };
      const section = input.contactSection ?? "overview";
      if (section === "tasks") {
        return { ...empty, taskContactId: contactId, includeTasks: true };
      }
      if (section === "letters") {
        return { ...empty, letterContactId: contactId, includeLetters: true };
      }
      return {
        ...empty,
        taskContactId: contactId,
        letterContactId: contactId,
        includeTasks: true,
        includeLetters: true,
      };
    }
    case "organization": {
      const organizationId = input.organizationId;
      if (!organizationId) return { ...empty, includeOrganizations: true };
      const section = input.organizationSection ?? "overview";
      if (section === "projects") {
        return {
          ...empty,
          projectOrganizationId: organizationId,
          includeProjects: true,
        };
      }
      if (section === "contacts") {
        return {
          ...empty,
          contactOrganizationId: organizationId,
          includeContacts: true,
        };
      }
      if (section === "letters") {
        return {
          ...empty,
          letterOrganizationId: organizationId,
          includeLetters: true,
        };
      }
      return {
        ...empty,
        projectOrganizationId: organizationId,
        contactOrganizationId: organizationId,
        letterOrganizationId: organizationId,
        includeProjects: true,
        includeContacts: true,
        includeLetters: true,
      };
    }
    default:
      return null;
  }
}

export async function globalSearch(
  workspaceId: string,
  q: string,
  limit = 20,
  options?: {
    mode?: GlobalSearchMode;
    contextKind?: string | null;
    projectId?: string | null;
    projectSection?: string | null;
    contactId?: string | null;
    contactSection?: string | null;
    organizationId?: string | null;
    organizationSection?: string | null;
  },
) {
  const pattern = `%${q}%`;
  const mode = options?.mode ?? "all";
  const contextScope =
    mode === "all"
      ? scopeFromContextParams({
          contextKind: options?.contextKind ?? null,
          projectId: options?.projectId ?? null,
          projectSection: options?.projectSection ?? null,
          contactId: options?.contactId ?? null,
          contactSection: options?.contactSection ?? null,
          organizationId: options?.organizationId ?? null,
          organizationSection: options?.organizationSection ?? null,
        })
      : null;
  const scope = contextScope ?? scopeForMode(mode);

  const projectConditions = [
    eq(projects.workspaceId, workspaceId),
    isNull(projects.deletedAt),
    or(ilike(projects.name, pattern), ilike(projects.summary, pattern)),
  ];
  if (scope.projectOrganizationId) {
    projectConditions.push(eq(projects.organizationId, scope.projectOrganizationId));
  }

  const taskConditions = [
    eq(tasks.workspaceId, workspaceId),
    isNull(tasks.deletedAt),
    or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)),
  ];
  if (scope.taskInboxOnly) {
    taskConditions.push(eq(tasks.inbox, true));
  }
  if (scope.taskProjectId) {
    taskConditions.push(eq(tasks.projectId, scope.taskProjectId));
  }
  if (scope.taskContactId) {
    taskConditions.push(eq(tasks.contactId, scope.taskContactId));
  }

  const projectDocConditions = [
    eq(documents.workspaceId, workspaceId),
    isNull(documents.deletedAt),
    eq(documents.type, "project"),
    or(
      ilike(documents.title, pattern),
      ilike(documents.path, pattern),
      ilike(documents.snippet, pattern),
    ),
  ];
  if (scope.documentProjectId) {
    projectDocConditions.push(eq(documents.projectId, scope.documentProjectId));
  }

  const knowledgeDocConditions = [
    eq(documents.workspaceId, workspaceId),
    isNull(documents.deletedAt),
    eq(documents.type, "knowledge"),
    or(
      ilike(documents.title, pattern),
      ilike(documents.path, pattern),
      ilike(documents.snippet, pattern),
    ),
  ];

  const orgConditions = [
    eq(organizations.workspaceId, workspaceId),
    isNull(organizations.deletedAt),
    ilike(organizations.name, pattern),
  ];

  const contactConditions = [
    eq(contacts.workspaceId, workspaceId),
    isNull(contacts.deletedAt),
    or(ilike(contacts.name, pattern), ilike(contacts.email, pattern)),
  ];
  if (scope.contactOrganizationId) {
    contactConditions.push(eq(contacts.organizationId, scope.contactOrganizationId));
  }

  const letterConditions = [
    eq(letters.workspaceId, workspaceId),
    isNull(letters.deletedAt),
    ilike(letters.title, pattern),
  ];
  if (scope.letterProjectId) {
    letterConditions.push(eq(letters.projectId, scope.letterProjectId));
  }
  if (scope.letterContactId) {
    letterConditions.push(eq(letters.contactId, scope.letterContactId));
  }
  if (scope.letterOrganizationId) {
    letterConditions.push(eq(letters.organizationId, scope.letterOrganizationId));
  }

  const [
    projectRows,
    taskRows,
    projectDocumentRows,
    knowledgeDocumentRows,
    organizationRows,
    contactRows,
    letterRows,
  ] = await Promise.all([
    scope.includeProjects
      ? db
          .select()
          .from(projects)
          .where(and(...projectConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeTasks
      ? db
          .select()
          .from(tasks)
          .where(and(...taskConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeDocuments
      ? db
          .select()
          .from(documents)
          .where(and(...projectDocConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeKnowledgeDocuments
      ? db
          .select()
          .from(documents)
          .where(and(...knowledgeDocConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeOrganizations
      ? db
          .select()
          .from(organizations)
          .where(and(...orgConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeContacts
      ? db
          .select()
          .from(contacts)
          .where(and(...contactConditions))
          .limit(limit)
      : Promise.resolve([]),
    scope.includeLetters
      ? db
          .select()
          .from(letters)
          .where(and(...letterConditions))
          .limit(limit)
      : Promise.resolve([]),
  ]);

  return [
    ...projectRows.map((row) => ({
      type: "project" as const,
      id: row.id,
      title: row.name,
      snippet: row.summary,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
    ...taskRows.map((row) => ({
      type: "task" as const,
      id: row.id,
      title: row.title,
      snippet: row.description,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
    ...projectDocumentRows.map((row) => ({
      type: "document" as const,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: row.updatedAt,
      documentType: "project" as const,
      path: row.path,
      projectId: row.projectId,
    })),
    ...knowledgeDocumentRows.map((row) => ({
      type: "document" as const,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: row.updatedAt,
      documentType: "knowledge" as const,
      path: row.path,
      projectId: null as null,
    })),
    ...organizationRows.map((row) => ({
      type: "organization" as const,
      id: row.id,
      title: row.name,
      snippet: row.summary,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
    ...contactRows.map((row) => ({
      type: "contact" as const,
      id: row.id,
      title: row.name,
      snippet: row.email,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
    ...letterRows.map((row) => ({
      type: "letter" as const,
      id: row.id,
      title: row.title,
      snippet: row.context,
      updatedAt: row.updatedAt,
      documentType: null as null,
      path: null as null,
      projectId: null as null,
    })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit)
    .map((row) => ({
      type: row.type,
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      updatedAt: row.updatedAt.toISOString(),
      ...(row.documentType ? { documentType: row.documentType } : {}),
      ...(row.path ? { path: row.path } : {}),
      ...(row.projectId ? { projectId: row.projectId } : {}),
    }));
}
