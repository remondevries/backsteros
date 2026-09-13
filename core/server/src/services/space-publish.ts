import { and, asc, count, eq, isNull } from "drizzle-orm";

import type {
  SpacePublishSettings,
  SpaceSeoMeta,
  SpaceSiteKey,
  UpdateSpacePublishSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import {
  documents,
  spacePublishSettings,
  spaceSiteKeys,
  type DbSpacePublishSettings,
  type DbSpaceSiteKey,
} from "../db/schema.js";
import {
  apiKeyLookupPrefix,
  generateSpaceSiteKeySecret,
  hashApiKey,
  newId,
  SPACE_SITE_KEY_PREFIX,
} from "../lib/crypto.js";

export {
  SPACE_SITE_KEY_PREFIX,
  generateSpaceSiteKeySecret,
} from "../lib/crypto.js";

const MAX_SPACE_SITE_KEYS = 20;

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

function optionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeAddress(
  value: unknown,
): SpaceSeoMeta["address"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const address = {
    streetAddress: optionalTrimmed(raw.streetAddress),
    addressLocality: optionalTrimmed(raw.addressLocality),
    addressRegion: optionalTrimmed(raw.addressRegion),
    postalCode: optionalTrimmed(raw.postalCode),
    addressCountry: optionalTrimmed(raw.addressCountry),
  };
  return Object.values(address).some(Boolean) ? address : undefined;
}

function normalizeSocial(value: unknown): SpaceSeoMeta["social"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const social = {
    facebook: optionalTrimmed(raw.facebook),
    twitter: optionalTrimmed(raw.twitter),
    linkedin: optionalTrimmed(raw.linkedin),
    instagram: optionalTrimmed(raw.instagram),
    youtube: optionalTrimmed(raw.youtube),
    github: optionalTrimmed(raw.github),
  };
  return Object.values(social).some(Boolean) ? social : undefined;
}

/** Coerce DB/client JSON into a compact SpaceSeoMeta (empty keys omitted). */
export function normalizeSpaceSeoMeta(value: unknown): SpaceSeoMeta {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const meta: SpaceSeoMeta = {
    siteName: optionalTrimmed(raw.siteName),
    organizationName: optionalTrimmed(raw.organizationName),
    phone: optionalTrimmed(raw.phone),
    email: optionalTrimmed(raw.email),
    address: normalizeAddress(raw.address),
    social: normalizeSocial(raw.social),
  };
  return Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined),
  ) as SpaceSeoMeta;
}

function toSiteKey(row: DbSpaceSiteKey): SpaceSiteKey {
  return {
    id: row.id,
    label: row.label,
    siteKeyPrefix: row.siteKeyPrefix,
    createdAt: row.createdAt.toISOString(),
  };
}

async function listSiteKeys(
  workspaceId: string,
  spaceDocumentId: string,
  executor: DbExecutor = db,
): Promise<SpaceSiteKey[]> {
  const rows = await executor
    .select()
    .from(spaceSiteKeys)
    .where(
      and(
        eq(spaceSiteKeys.workspaceId, workspaceId),
        eq(spaceSiteKeys.spaceDocumentId, spaceDocumentId),
      ),
    )
    .orderBy(asc(spaceSiteKeys.createdAt));
  return rows.map(toSiteKey);
}

async function toSettings(
  row: DbSpacePublishSettings,
  executor: DbExecutor = db,
): Promise<SpacePublishSettings> {
  const keys = await listSiteKeys(
    row.workspaceId,
    row.spaceDocumentId,
    executor,
  );
  return {
    spaceDocumentId: row.spaceDocumentId,
    publicBaseUrl: row.publicBaseUrl ?? null,
    allowedDomains: row.allowedDomains ?? [],
    seoMeta: normalizeSpaceSeoMeta(row.seoMeta),
    siteKeys: keys,
    siteKeyPresent: keys.length > 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertSpaceFolder(
  workspaceId: string,
  spaceDocumentId: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.id, spaceDocumentId),
        eq(documents.kind, "folder"),
        eq(documents.type, "knowledge"),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function getSettingsRow(
  workspaceId: string,
  spaceDocumentId: string,
  executor: DbExecutor = db,
) {
  const [row] = await executor
    .select()
    .from(spacePublishSettings)
    .where(
      and(
        eq(spacePublishSettings.workspaceId, workspaceId),
        eq(spacePublishSettings.spaceDocumentId, spaceDocumentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getOrCreateSpacePublishSettings(
  workspaceId: string,
  spaceDocumentId: string,
  executor: DbExecutor = db,
): Promise<SpacePublishSettings | null> {
  const folder = await assertSpaceFolder(workspaceId, spaceDocumentId, executor);
  if (!folder) return null;

  const existing = await getSettingsRow(workspaceId, spaceDocumentId, executor);
  if (existing) return toSettings(existing, executor);

  const [created] = await executor
    .insert(spacePublishSettings)
    .values({
      id: newId(),
      workspaceId,
      spaceDocumentId,
      publicBaseUrl: null,
      allowedDomains: [],
      seoMeta: {},
      siteKeyPrefix: null,
      siteKeyHash: null,
      siteKeyCreatedAt: null,
    })
    .returning();

  return created ? toSettings(created, executor) : null;
}

export async function updateSpacePublishSettings(
  workspaceId: string,
  spaceDocumentId: string,
  input: UpdateSpacePublishSettingsInput,
  executor: DbExecutor = db,
): Promise<SpacePublishSettings | null> {
  const current = await getOrCreateSpacePublishSettings(
    workspaceId,
    spaceDocumentId,
    executor,
  );
  if (!current) return null;

  const [row] = await executor
    .update(spacePublishSettings)
    .set({
      publicBaseUrl:
        input.publicBaseUrl !== undefined
          ? input.publicBaseUrl
          : undefined,
      allowedDomains:
        input.allowedDomains !== undefined
          ? input.allowedDomains
              .map((d) => d.trim().toLowerCase())
              .filter(Boolean)
          : undefined,
      seoMeta:
        input.seoMeta !== undefined
          ? normalizeSpaceSeoMeta(input.seoMeta)
          : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(spacePublishSettings.workspaceId, workspaceId),
        eq(spacePublishSettings.spaceDocumentId, spaceDocumentId),
      ),
    )
    .returning();

  return row ? toSettings(row, executor) : null;
}

export async function createSpaceSiteKey(
  workspaceId: string,
  spaceDocumentId: string,
  label: string,
  executor: DbExecutor = db,
): Promise<
  | { settings: SpacePublishSettings; siteKey: string; key: SpaceSiteKey }
  | { error: "not_found" | "limit" }
> {
  const current = await getOrCreateSpacePublishSettings(
    workspaceId,
    spaceDocumentId,
    executor,
  );
  if (!current) return { error: "not_found" };

  const [countRow] = await executor
    .select({ value: count() })
    .from(spaceSiteKeys)
    .where(
      and(
        eq(spaceSiteKeys.workspaceId, workspaceId),
        eq(spaceSiteKeys.spaceDocumentId, spaceDocumentId),
      ),
    );
  if (Number(countRow?.value ?? 0) >= MAX_SPACE_SITE_KEYS) {
    return { error: "limit" };
  }

  const trimmedLabel = label.trim();
  if (!trimmedLabel) return { error: "not_found" };

  const siteKey = generateSpaceSiteKeySecret();
  const [created] = await executor
    .insert(spaceSiteKeys)
    .values({
      id: newId(),
      workspaceId,
      spaceDocumentId,
      label: trimmedLabel,
      siteKeyPrefix: apiKeyLookupPrefix(siteKey),
      siteKeyHash: hashApiKey(siteKey),
    })
    .returning();

  if (!created) return { error: "not_found" };

  const settingsRow = await getSettingsRow(
    workspaceId,
    spaceDocumentId,
    executor,
  );
  if (!settingsRow) return { error: "not_found" };

  return {
    siteKey,
    key: toSiteKey(created),
    settings: await toSettings(settingsRow, executor),
  };
}

export async function revokeSpaceSiteKey(
  workspaceId: string,
  spaceDocumentId: string,
  keyId: string,
  executor: DbExecutor = db,
): Promise<SpacePublishSettings | null> {
  const current = await getOrCreateSpacePublishSettings(
    workspaceId,
    spaceDocumentId,
    executor,
  );
  if (!current) return null;

  const deleted = await executor
    .delete(spaceSiteKeys)
    .where(
      and(
        eq(spaceSiteKeys.workspaceId, workspaceId),
        eq(spaceSiteKeys.spaceDocumentId, spaceDocumentId),
        eq(spaceSiteKeys.id, keyId),
      ),
    )
    .returning({ id: spaceSiteKeys.id });

  if (deleted.length === 0) return null;

  const settingsRow = await getSettingsRow(
    workspaceId,
    spaceDocumentId,
    executor,
  );
  return settingsRow ? toSettings(settingsRow, executor) : null;
}

/** @deprecated Prefer {@link createSpaceSiteKey}. */
export async function rotateSpaceSiteKey(
  workspaceId: string,
  spaceDocumentId: string,
  executor: DbExecutor = db,
) {
  const result = await createSpaceSiteKey(
    workspaceId,
    spaceDocumentId,
    "Default",
    executor,
  );
  if ("error" in result) return null;
  return { settings: result.settings, siteKey: result.siteKey };
}

export async function authenticateSpaceSiteKey(
  spaceDocumentId: string,
  siteKey: string,
  originHost: string | null,
  executor: DbExecutor = db,
): Promise<
  | { ok: true; workspaceId: string; settings: DbSpacePublishSettings }
  | { ok: false; code: "unauthorized" | "forbidden" }
> {
  const trimmed = siteKey.trim();
  if (!trimmed.startsWith(SPACE_SITE_KEY_PREFIX)) {
    return { ok: false, code: "unauthorized" };
  }

  const prefix = apiKeyLookupPrefix(trimmed);
  const hash = hashApiKey(trimmed);
  const [keyRow] = await executor
    .select()
    .from(spaceSiteKeys)
    .where(
      and(
        eq(spaceSiteKeys.spaceDocumentId, spaceDocumentId),
        eq(spaceSiteKeys.siteKeyPrefix, prefix),
        eq(spaceSiteKeys.siteKeyHash, hash),
      ),
    )
    .limit(1);

  if (!keyRow) return { ok: false, code: "unauthorized" };

  const [settingsRow] = await executor
    .select()
    .from(spacePublishSettings)
    .where(
      and(
        eq(spacePublishSettings.workspaceId, keyRow.workspaceId),
        eq(spacePublishSettings.spaceDocumentId, spaceDocumentId),
      ),
    )
    .limit(1);

  if (!settingsRow) return { ok: false, code: "unauthorized" };

  const allowed = (settingsRow.allowedDomains ?? []).map((d: string) =>
    d.toLowerCase(),
  );
  if (allowed.length > 0) {
    const host = (originHost ?? "").toLowerCase().replace(/:\d+$/, "");
    const hostWithPort = (originHost ?? "").toLowerCase();
    const ok = allowed.some(
      (domain: string) =>
        domain === host ||
        domain === hostWithPort ||
        host.endsWith(`.${domain}`),
    );
    if (!ok) return { ok: false, code: "forbidden" };
  }

  return {
    ok: true,
    workspaceId: keyRow.workspaceId,
    settings: settingsRow,
  };
}

export function hostFromRequest(input: {
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
}): string | null {
  for (const raw of [input.origin, input.referer]) {
    if (!raw) continue;
    try {
      return new URL(raw).host;
    } catch {
      // ignore
    }
  }
  return input.host?.trim() || null;
}
