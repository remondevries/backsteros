import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  areas,
  avatars,
  bankAccounts,
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
import { normalizeContactEmailsInput, normalizeContactPhonesInput } from "@backsteros/contracts";
import { hashPortalPassword } from "../lib/portal-password.js";
import {
  assertPrivateStorageKey,
  buildLetterPdfStorageKey,
  buildPrivateStorageKey,
  checksumForContent,
  deleteObject,
  getObject,
  letterPdfSubjectFromFilename,
  moveObject,
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
  emails?: { label: "general" | "support" | "other"; address: string }[];
  phones?: { label: "general" | "support" | "other"; number: string }[];
  website?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  size?: string | null;
  socialAccounts?: { platform: string; url: string }[];
  chamberOfCommerce?: string | null;
  taxNumber?: string | null;
  avatarStorageKey?: string | null;
  avatarContentType?: string | null;
  sortOrder?: number;
  notes?: string | null;
  moneybirdContactId?: string | null;
};
type ContactSocialAccount = {
  platform: string;
  url: string;
};
type ContactInput = {
  number?: number | null;
  key: string;
  organizationId?: string | null;
  firstName?: string;
  lastName?: string | null;
  /** Legacy full name — treated as firstName when firstName is omitted. */
  name?: string;
  email?: string | null;
  emails?: { label: "personal" | "work" | "other"; address: string }[];
  title?: string | null;
  summary?: string | null;
  avatarStorageKey?: string | null;
  avatarContentType?: string | null;
  sortOrder?: number;
  phone?: string | null;
  phones?: { label: "personal" | "work" | "other"; number: string }[];
  role?: string | null;
  notes?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  socialAccounts?: ContactSocialAccount[];
  birthday?: string | null;
  languages?: Array<"nl" | "en" | "de" | "es" | "fr" | "pl">;
  portalUsername?: string | null;
  /** Write-only; hashed before persist. Null/"" clears. */
  portalPassword?: string | null;
  portalPasswordHash?: string | null;
  portalSettings?: {
    language?: "en" | "nl";
    enabledProjectIds?: string[] | null;
    financials?: boolean;
    support?: boolean;
    canAddTickets?: boolean;
    canAddTasks?: boolean;
  } | null;
};

function formatContactDisplayName(
  firstName: string,
  lastName?: string | null,
): string {
  return [firstName.trim(), (lastName ?? "").trim()]
    .filter((part) => part.length > 0)
    .join(" ");
}

function resolveContactNameFields(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): { firstName: string; lastName: string; name: string } {
  const firstName = (input.firstName ?? input.name ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  return {
    firstName,
    lastName,
    name: formatContactDisplayName(firstName, lastName) || firstName,
  };
}
type AreaInput = {
  name: string;
  parent: "personal" | "business" | "clients";
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
  storageKey?: string;
  contentType?: string;
  byteSize?: number;
  checksum?: string | null;
  contentEtag?: string | null;
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
async function resolveEntityNumber(
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
  const number = await resolveEntityNumber(
    workspaceId,
    "organization",
    input.number,
    executor,
  );
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
  const patch: Partial<OrganizationInput> = { ...input };
  if (patch.moneybirdContactId !== undefined) {
    const nextContactId = patch.moneybirdContactId?.trim() || null;
    patch.moneybirdContactId = nextContactId;
    if (nextContactId) {
      await executor
        .update(organizations)
        .set({ moneybirdContactId: null, updatedAt: new Date() })
        .where(
          and(
            eq(organizations.workspaceId, workspaceId),
            eq(organizations.moneybirdContactId, nextContactId),
            ne(organizations.id, id),
            isNull(organizations.deletedAt),
          ),
        );
    }
  }

  const [row] = await executor
    .update(organizations)
    .set({ ...patch, updatedAt: new Date() })
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
    conditions.push(
      or(
        ilike(contacts.name, pattern),
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(contacts.email, pattern),
        sql`exists (
          select 1 from jsonb_array_elements(${contacts.emails}) as e(value)
          where coalesce(e.value->>'address', e.value #>> '{}') ilike ${pattern}
        )`,
      )!,
    );
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
  const names = resolveContactNameFields(input);
  if (!names.firstName) {
    throw new Error("CONTACT_NAME_REQUIRED");
  }
  const number = await resolveEntityNumber(
    workspaceId,
    "contact",
    input.number,
    executor,
  );
  const {
    name: _legacyName,
    firstName: _f,
    lastName: _l,
    email,
    emails,
    phone,
    phones,
    portalPassword,
    portalPasswordHash: incomingHash,
    portalSettings: portalSettingsInput,
    ...rest
  } = input;
  const emailFields = normalizeContactEmailsInput({
    email: email ?? null,
    emails: emails ?? [],
  });
  const phoneFields = normalizeContactPhonesInput({
    phone: phone ?? null,
    phones: phones ?? [],
  });
  let portalPasswordHash: string | null = incomingHash ?? null;
  if (portalPassword !== undefined) {
    if (portalPassword === null || portalPassword === "") {
      portalPasswordHash = null;
    } else {
      portalPasswordHash = await hashPortalPassword(portalPassword);
    }
  }
  const portalSettings =
    portalSettingsInput === null || portalSettingsInput === undefined
      ? {}
      : portalSettingsInput;
  const [row] = await executor
    .insert(contacts)
    .values({
      id,
      workspaceId,
      ...rest,
      ...names,
      ...emailFields,
      ...phoneFields,
      number,
      portalPasswordHash,
      portalSettings,
    } as typeof contacts.$inferInsert)
    .returning();
  return row!;
}

export async function getContactByPortalUsername(
  workspaceId: string,
  username: string,
  executor: DbExecutor = db,
) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await executor
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
        sql`lower(${contacts.portalUsername}) = ${normalized}`,
      ),
    )
    .limit(1);
  return row ?? null;
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
    db.select().from(tasks).where(and(
      eq(tasks.workspaceId, workspaceId),
      or(
        eq(tasks.contactId, id),
        eq(tasks.assigneeId, id),
        sql`${tasks.relatedContactIds} @> ${JSON.stringify([id])}::jsonb`,
      ),
      isNull(tasks.deletedAt),
    )),
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
  const touchesNames =
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.name !== undefined;
  const touchesEmails =
    input.email !== undefined || input.emails !== undefined;
  const touchesPhones =
    input.phone !== undefined || input.phones !== undefined;
  let namePatch: { firstName: string; lastName: string; name: string } | null =
    null;
  let emailPatch: {
    email: string | null;
    emails: { label: "personal" | "work" | "other"; address: string }[];
  } | null = null;
  let phonePatch: {
    phone: string | null;
    phones: { label: "personal" | "work" | "other"; number: string }[];
  } | null = null;
  if (touchesNames || touchesEmails || touchesPhones) {
    const existing = await getContactById(workspaceId, id, executor);
    if (!existing) return null;
    if (touchesNames) {
      // ADR-032: structured first/last win. Legacy `name`-only patches replace
      // identity (map onto firstName) so clients that still send a single name
      // field do not no-op against an existing firstName.
      if (input.firstName !== undefined || input.lastName !== undefined) {
        namePatch = resolveContactNameFields({
          firstName:
            input.firstName !== undefined
              ? input.firstName
              : existing.firstName,
          lastName:
            input.lastName !== undefined ? input.lastName : existing.lastName,
        });
      } else if (input.name !== undefined) {
        namePatch = resolveContactNameFields({
          firstName: input.name,
          lastName: "",
        });
      }
      if (!namePatch?.firstName) {
        throw new Error("CONTACT_NAME_REQUIRED");
      }
    }
    if (touchesEmails) {
      emailPatch = normalizeContactEmailsInput({
        email: input.email !== undefined ? input.email : existing.email,
        emails: input.emails !== undefined ? input.emails : existing.emails,
      });
    }
    if (touchesPhones) {
      phonePatch = normalizeContactPhonesInput({
        phone: input.phone !== undefined ? input.phone : existing.phone,
        phones: input.phones !== undefined ? input.phones : existing.phones,
      });
    }
  }
  const {
    name: _legacyName,
    firstName: _f,
    lastName: _l,
    email: _e,
    emails: _es,
    phone: _p,
    phones: _ps,
    portalPassword,
    portalPasswordHash: _ignoredHash,
    portalSettings: portalSettingsInput,
    ...rest
  } = input;
  let portalPasswordHash: string | null | undefined;
  if (portalPassword !== undefined) {
    if (portalPassword === null || portalPassword === "") {
      portalPasswordHash = null;
    } else {
      portalPasswordHash = await hashPortalPassword(portalPassword);
    }
  } else if (input.portalPasswordHash !== undefined) {
    portalPasswordHash = input.portalPasswordHash;
  }
  const portalSettings =
    portalSettingsInput === null ? {} : portalSettingsInput;
  const [row] = await executor
    .update(contacts)
    .set({
      ...rest,
      ...(namePatch ?? {}),
      ...(emailPatch ?? {}),
      ...(phonePatch ?? {}),
      ...(portalPasswordHash !== undefined ? { portalPasswordHash } : {}),
      ...(portalSettingsInput !== undefined ? { portalSettings } : {}),
      updatedAt: new Date(),
    })
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

export async function createArea(
  workspaceId: string,
  input: AreaInput,
  id = newId(),
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(areas)
    .values({ id, workspaceId, ...input })
    .returning();
  return row!;
}

export async function getAreaById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(areas)
    .where(and(eq(areas.workspaceId, workspaceId), eq(areas.id, id), isNull(areas.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function updateArea(
  workspaceId: string,
  id: string,
  input: Partial<AreaInput>,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .update(areas)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(areas.workspaceId, workspaceId), eq(areas.id, id), isNull(areas.deletedAt)))
    .returning();
  return row ?? null;
}

export async function deleteArea(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
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
  const number = await resolveEntityNumber(
    workspaceId,
    "letter",
    input.number,
    executor,
  );
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
  const shouldRelocatePdfs =
    input.receivedDate !== undefined || input.title !== undefined;
  const titleChanged =
    input.title !== undefined && typeof input.title === "string";
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
  if (!row) return null;
  if (shouldRelocatePdfs) {
    // Keep primary PDF tab label aligned with the letter title.
    if (titleChanged) {
      await syncPrimaryLetterAttachmentFilename(
        workspaceId,
        row.id,
        `${row.title.trim() || "Letter"}.pdf`,
      );
    }
    await relocateLetterPdfAttachments(workspaceId, row);
    return (await getLetterById(workspaceId, id, executor)) ?? row;
  }
  return row;
}

function attachmentFilingSubject(
  attachment: Pick<typeof letterAttachments.$inferSelect, "originalFilename">,
  letterTitle: string,
): string {
  const fromFilename = attachment.originalFilename?.trim()
    ? letterPdfSubjectFromFilename(attachment.originalFilename)
    : "";
  return fromFilename || letterTitle.trim() || "Letter";
}

async function syncPrimaryLetterAttachmentFilename(
  workspaceId: string,
  letterId: string,
  originalFilename: string,
) {
  const attachments = await listLetterAttachments(workspaceId, letterId);
  const primary = attachments?.[0];
  if (!primary) return;
  const filename = originalFilename.trim();
  if (!filename || primary.originalFilename === filename) return;
  await db
    .update(letterAttachments)
    .set({ originalFilename: filename, updatedAt: new Date() })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.id, primary.id),
        isNull(letterAttachments.deletedAt),
      ),
    );
}

async function moveLetterAttachmentToKey(
  workspaceId: string,
  attachment: typeof letterAttachments.$inferSelect,
  nextKey: string,
): Promise<typeof letterAttachments.$inferSelect | null> {
  if (nextKey === attachment.storageKey) return attachment;
  try {
    await moveObject(attachment.storageKey, nextKey);
  } catch (error) {
    // Keep the existing key when the blob is missing. Updating metadata to a
    // path with no file breaks hybrid cloud→local (cloud has no PDF bytes)
    // and surfaces as 500 "Internal server error" on download.
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      console.warn(
        "[api] letter PDF relocate skipped; object missing",
        attachment.storageKey,
        "→",
        nextKey,
      );
      return attachment;
    }
    throw error;
  }
  const [updated] = await db
    .update(letterAttachments)
    .set({ storageKey: nextKey, updatedAt: new Date() })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.id, attachment.id),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  return updated ?? { ...attachment, storageKey: nextKey };
}

/** Re-file letter PDFs under Letters/YYYY/MM using Received Date (else today). */
async function relocateLetterPdfAttachments(
  workspaceId: string,
  letter: typeof letters.$inferSelect,
) {
  const attachments = await listLetterAttachments(workspaceId, letter.id);
  if (!attachments?.length) return;

  let movedPrimary: typeof letterAttachments.$inferSelect | null = null;
  for (const attachment of attachments) {
    const nextKey = buildLetterPdfStorageKey({
      title: letter.title,
      subject: attachmentFilingSubject(attachment, letter.title),
      receivedDate: letter.receivedDate,
      attachmentId: attachment.id,
    });
    const updated = await moveLetterAttachmentToKey(
      workspaceId,
      attachment,
      nextKey,
    );
    if (updated && !movedPrimary) movedPrimary = updated;
  }

  const refreshed = await listLetterAttachments(workspaceId, letter.id);
  await syncLetterPrimaryAttachment(
    workspaceId,
    letter.id,
    refreshed?.[0] ?? movedPrimary,
  );
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
  const originalFilename = fileName || "letter.pdf";
  const key = buildLetterPdfStorageKey({
    title: letter.title,
    subject: letterPdfSubjectFromFilename(originalFilename),
    receivedDate: letter.receivedDate,
    attachmentId,
  });
  const stored = await putObject(key, bytes, "application/pdf");
  const [attachment] = await db
    .insert(letterAttachments)
    .values({
      id: attachmentId,
      workspaceId,
      letterId,
      storageKey: key,
      originalFilename,
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

async function readLetterAttachmentObject(
  workspaceId: string,
  row: typeof letterAttachments.$inferSelect,
  letter?: typeof letters.$inferSelect | null,
) {
  assertPrivateStorageKey(workspaceId, row.storageKey);
  try {
    const object = await getObject(row.storageKey);
    return { row, bytes: object.bytes };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "STORAGE_OBJECT_NOT_FOUND"
    ) {
      throw error;
    }
  }

  // Heal stale keys (e.g. cloud renamed filing path without the local blob).
  const letterRow =
    letter ?? (await getLetterById(workspaceId, row.letterId));
  const fallbackKeys = [
    letterRow?.storageKey,
    letterRow
      ? buildLetterPdfStorageKey({
          title: letterRow.title,
          subject: attachmentFilingSubject(row, letterRow.title),
          receivedDate: letterRow.receivedDate,
          attachmentId: row.id,
        })
      : null,
    letterRow
      ? buildLetterPdfStorageKey({
          title: letterRow.title,
          receivedDate: letterRow.receivedDate,
          attachmentId: row.id,
        })
      : null,
  ].filter(
    (key): key is string =>
      Boolean(key) && key !== row.storageKey,
  );

  for (const key of fallbackKeys) {
    try {
      assertPrivateStorageKey(workspaceId, key);
      const object = await getObject(key);
      const [healed] = await db
        .update(letterAttachments)
        .set({ storageKey: key, updatedAt: new Date() })
        .where(
          and(
            eq(letterAttachments.workspaceId, workspaceId),
            eq(letterAttachments.id, row.id),
            isNull(letterAttachments.deletedAt),
          ),
        )
        .returning();
      const nextRow = healed ?? { ...row, storageKey: key };
      await syncLetterPrimaryAttachment(workspaceId, row.letterId, nextRow);
      console.warn(
        "[api] healed letter attachment storage key",
        row.storageKey,
        "→",
        key,
      );
      return { row: nextRow, bytes: object.bytes };
    } catch (fallbackError) {
      if (
        fallbackError instanceof Error &&
        fallbackError.message === "STORAGE_OBJECT_NOT_FOUND"
      ) {
        continue;
      }
      throw fallbackError;
    }
  }

  throw new Error("STORAGE_OBJECT_NOT_FOUND");
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
  return readLetterAttachmentObject(workspaceId, row);
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
  try {
    const object = await getObject(row.storageKey);
    return { row, bytes: object.bytes };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STORAGE_OBJECT_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }
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

  // Soft-delete keeps Tier B sync tombstones; still drop the blob so storage
  // does not retain PDFs the user removed from the letter.
  if (row.storageKey) {
    try {
      assertPrivateStorageKey(workspaceId, row.storageKey);
      await deleteObject(row.storageKey);
    } catch (error) {
      console.error(
        "[api] failed to delete letter attachment object",
        row.storageKey,
        error,
      );
    }
  }

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

  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;

  const [current] = await db
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
  if (!current) return null;

  const subject = letterPdfSubjectFromFilename(filename);
  const nextKey = buildLetterPdfStorageKey({
    title: letter.title,
    subject,
    receivedDate: letter.receivedDate,
    attachmentId: current.id,
  });
  const moved =
    (await moveLetterAttachmentToKey(workspaceId, current, nextKey)) ?? current;

  const [row] = await db
    .update(letterAttachments)
    .set({
      originalFilename: filename,
      storageKey: moved.storageKey,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(letterAttachments.workspaceId, workspaceId),
        eq(letterAttachments.id, attachmentId),
        isNull(letterAttachments.deletedAt),
      ),
    )
    .returning();
  if (!row) return null;

  const attachments = await listLetterAttachments(workspaceId, letterId);
  const primary = attachments?.[0];
  const isPrimary = primary?.id === attachmentId;
  if (isPrimary) {
    // Letter title follows the primary PDF name so vault browsing stays clear.
    if (letter.title !== subject) {
      await db
        .update(letters)
        .set({ title: subject, updatedAt: new Date() })
        .where(
          and(
            eq(letters.workspaceId, workspaceId),
            eq(letters.id, letterId),
            isNull(letters.deletedAt),
          ),
        );
    }
    await syncLetterPrimaryAttachment(workspaceId, letterId, row);
  }
  return row;
}

export async function reorderLetterAttachments(
  workspaceId: string,
  letterId: string,
  orderedIds: string[],
) {
  const letter = await getLetterById(workspaceId, letterId);
  if (!letter) return null;

  const uniqueIds = [...new Set(orderedIds)];
  if (uniqueIds.length !== orderedIds.length) {
    throw new Error("ATTACHMENT_IDS_INVALID");
  }

  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: letterAttachments.id })
      .from(letterAttachments)
      .where(
        and(
          eq(letterAttachments.workspaceId, workspaceId),
          eq(letterAttachments.letterId, letterId),
          inArray(letterAttachments.id, orderedIds),
          isNull(letterAttachments.deletedAt),
        ),
      );
    if (owned.length !== orderedIds.length) {
      throw new Error("ATTACHMENT_NOT_FOUND");
    }

    const rows = [];
    for (const [index, id] of orderedIds.entries()) {
      const [row] = await tx
        .update(letterAttachments)
        .set({ sortOrder: index + 1, updatedAt: new Date() })
        .where(
          and(
            eq(letterAttachments.workspaceId, workspaceId),
            eq(letterAttachments.letterId, letterId),
            eq(letterAttachments.id, id),
            isNull(letterAttachments.deletedAt),
          ),
        )
        .returning();
      if (row) rows.push(row);
    }

    const primary = rows[0] ?? null;
    await tx
      .update(letters)
      .set({
        storageKey: primary?.storageKey ?? "",
        originalFilename: primary?.originalFilename ?? "",
        contentType: primary?.contentType ?? "application/pdf",
        byteSize: primary?.byteSize ?? 0,
        checksum: primary?.checksum ?? null,
        contentEtag: primary?.contentEtag ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(letters.workspaceId, workspaceId), eq(letters.id, letterId)));

    return rows;
  });
}

export async function putAvatar(
  workspaceId: string,
  entityType: string,
  entityId: string,
  bytes: Uint8Array,
  contentType: string,
  options?: { updateEntityColumns?: boolean },
) {
  const updateEntityColumns = options?.updateEntityColumns !== false;
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
  if (updateEntityColumns) {
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
    } else if (entityType === "bank_account") {
      await db
        .update(bankAccounts)
        .set({
          avatarStorageKey: key,
          avatarContentType: contentType,
          updatedAt: new Date(),
        })
        .where(
          and(eq(bankAccounts.workspaceId, workspaceId), eq(bankAccounts.id, entityId)),
        );
    }
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
  options?: { updateEntityColumns?: boolean },
) {
  const updateEntityColumns = options?.updateEntityColumns !== false;
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

  if (updateEntityColumns) {
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
    } else if (entityType === "bank_account") {
      await db
        .update(bankAccounts)
        .set({
          avatarStorageKey: null,
          avatarContentType: null,
          updatedAt: new Date(),
        })
        .where(
          and(eq(bankAccounts.workspaceId, workspaceId), eq(bankAccounts.id, entityId)),
        );
    }
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
  let next: Record<string, unknown> = { ...current, ...patch };
  // Cloud must never persist a peer Mac vaultPath (or any machine-local key).
  if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
    const { vaultPath: _ignored, ...rest } = next;
    next = rest;
  }
  const [row] = await executor
    .insert(workspaceSettings)
    .values({ workspaceId, settings: next })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { settings: next, updatedAt: new Date() },
    })
    .returning();
  return row!.settings;
}

/** Replace settings JSON wholesale (used to scrub machine-local keys). */
export async function replaceSettings(
  workspaceId: string,
  settings: Record<string, unknown>,
  executor: DbExecutor = db,
) {
  let next = { ...settings };
  if (process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud") {
    const { vaultPath: _ignored, ...rest } = next;
    next = rest;
  }
  const [row] = await executor
    .insert(workspaceSettings)
    .values({ workspaceId, settings: next })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { settings: next, updatedAt: new Date() },
    })
    .returning();
  return row!.settings;
}

export function listMentions(workspaceId: string, userId?: string | null) {
  const conditions = [eq(mentions.workspaceId, workspaceId)];
  if (userId) conditions.push(eq(mentions.userId, userId));
  return db.select().from(mentions).where(and(...conditions)).orderBy(desc(mentions.createdAt));
}

export async function getMentionById(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(mentions)
    .where(and(eq(mentions.workspaceId, workspaceId), eq(mentions.id, id)))
    .limit(1);
  return row ?? null;
}

export async function createMention(
  workspaceId: string,
  input: {
    userId?: string | null;
    sourceType: string;
    sourceId: string;
    excerpt?: string | null;
    readAt?: string | null;
  },
  id = newId(),
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .insert(mentions)
    .values({
      id,
      workspaceId,
      userId: input.userId ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      excerpt: input.excerpt ?? null,
      readAt: input.readAt ? new Date(input.readAt) : null,
    })
    .returning();
  return row!;
}

export async function markMentionRead(
  workspaceId: string,
  id: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
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
    or(
      ilike(contacts.name, pattern),
      ilike(contacts.firstName, pattern),
      ilike(contacts.lastName, pattern),
      ilike(contacts.email, pattern),
      sql`exists (
        select 1 from jsonb_array_elements(${contacts.emails}) as e(value)
        where coalesce(e.value->>'address', e.value #>> '{}') ilike ${pattern}
      )`,
    ),
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
