import { and, asc, eq, gte, ilike, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { normalizeContactEmailsInput, normalizeContactPhonesInput } from "@backsteros/contracts";

import { areas, contacts, organizations } from "../../db/schema.js";
import { db } from "../../db/index.js";
import {
  decodeUpdatedAtCursor,
  encodeUpdatedAtCursor,
  type ParsedContactsListQuery,
  type ParsedOrganizationsListQuery,
} from "../../lib/list-query.js";
import { newId } from "../../lib/crypto.js";
import { type DbExecutor, organizationExists, resolveEntityNumber } from "./shared.js";
import { hashPortalPassword } from "../../lib/portal-password.js";
import { rethrowPortalUsernameConflict } from "../../lib/portal-contact-auth.js";
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
  portalAvatarStorageKey?: string | null;
  portalAvatarContentType?: string | null;
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

export function listOrganizations(
  workspaceId: string,
  filters: { q?: string; updatedSince?: Date } = {},
) {
  const conditions = [
    eq(organizations.workspaceId, workspaceId),
  ];
  if (filters.updatedSince) {
    conditions.push(gte(organizations.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(organizations.deletedAt));
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(organizations.name, pattern),
        ilike(organizations.key, pattern),
        ilike(organizations.email, pattern),
        ilike(organizations.website, pattern),
        ilike(organizations.city, pattern),
        sql`exists (
          select 1 from jsonb_array_elements(coalesce(${organizations.emails}, '[]'::jsonb)) as e(value)
          where coalesce(e.value->>'address', e.value #>> '{}') ilike ${pattern}
        )`,
      )!,
    );
  }
  return db
    .select()
    .from(organizations)
    .where(and(...conditions))
    .orderBy(organizations.sortOrder, organizations.name);
}

export async function listOrganizationsPaginated(
  workspaceId: string,
  filters: ParsedOrganizationsListQuery,
  nowMs: number = Date.now(),
) {
  const conditions: SQL[] = [eq(organizations.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(organizations.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(organizations.deletedAt));
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(organizations.name, pattern),
        ilike(organizations.key, pattern),
        ilike(organizations.email, pattern),
        ilike(organizations.website, pattern),
        ilike(organizations.city, pattern),
        sql`exists (
          select 1 from jsonb_array_elements(coalesce(${organizations.emails}, '[]'::jsonb)) as e(value)
          where coalesce(e.value->>'address', e.value #>> '{}') ilike ${pattern}
        )`,
      )!,
    );
  }
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${organizations.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${organizations.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${organizations.id} > ${cursor.id}
        )
      )`,
    );
  }
  const rows = await db
    .select()
    .from(organizations)
    .where(and(...conditions))
    .orderBy(
      sql`date_trunc('milliseconds', ${organizations.updatedAt}) desc`,
      asc(organizations.id),
    )
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
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
  filters: { organizationId?: string; q?: string; updatedSince?: Date } = {},
) {
  const conditions = [
    eq(contacts.workspaceId, workspaceId),
  ];
  if (filters.updatedSince) {
    conditions.push(gte(contacts.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(contacts.deletedAt));
  }
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

export async function listContactsPaginated(
  workspaceId: string,
  filters: ParsedContactsListQuery,
  nowMs: number = Date.now(),
) {
  const conditions: SQL[] = [eq(contacts.workspaceId, workspaceId)];
  if (filters.updatedSince) {
    conditions.push(gte(contacts.updatedAt, filters.updatedSince));
  } else {
    conditions.push(isNull(contacts.deletedAt));
  }
  if (filters.organizationId) {
    conditions.push(eq(contacts.organizationId, filters.organizationId));
  }
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
  if (filters.cursor?.trim()) {
    const cursor = decodeUpdatedAtCursor(filters.cursor, nowMs);
    conditions.push(
      sql`(
        date_trunc('milliseconds', ${contacts.updatedAt}) < date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
        OR (
          date_trunc('milliseconds', ${contacts.updatedAt}) = date_trunc('milliseconds', ${cursor.updatedAt}::timestamptz)
          AND ${contacts.id} > ${cursor.id}
        )
      )`,
    );
  }
  const rows = await db
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(
      sql`date_trunc('milliseconds', ${contacts.updatedAt}) desc`,
      asc(contacts.id),
    )
    .limit(filters.limit + 1);
  const hasMore = rows.length > filters.limit;
  const page = hasMore ? rows.slice(0, filters.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor:
      hasMore && last
        ? encodeUpdatedAtCursor(
            { id: last.id, updatedAt: last.updatedAt },
            nowMs,
          )
        : null,
  };
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
  try {
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
  } catch (error) {
    rethrowPortalUsernameConflict(error);
  }
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

/** Resolve a portal login identifier — username first, then a unique email match. */
export async function getContactForPortalLogin(
  workspaceId: string,
  username: string,
  executor: DbExecutor = db,
) {
  const byUsername = await getContactByPortalUsername(
    workspaceId,
    username,
    executor,
  );
  if (byUsername) return byUsername;

  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;

  const rows = await executor
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        isNull(contacts.deletedAt),
        sql`${contacts.portalPasswordHash} is not null`,
        or(
          sql`lower(${contacts.email}) = ${normalized}`,
          sql`exists (
            select 1 from jsonb_array_elements(${contacts.emails}) as e(value)
            where lower(coalesce(e.value->>'address', e.value #>> '{}')) = ${normalized}
          )`,
        ),
      ),
    );
  return rows.length === 1 ? rows[0]! : null;
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
  try {
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
  } catch (error) {
    rethrowPortalUsernameConflict(error);
  }
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
