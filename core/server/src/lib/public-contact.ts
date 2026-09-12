import type { contacts } from "../db/schema.js";
import {
  contactPortalSettingsSchema,
  DEFAULT_CONTACT_PORTAL_SETTINGS,
  type ContactPortalSettings,
} from "@backsteros/contracts";

type ContactRow = typeof contacts.$inferSelect;

export function normalizeContactPortalSettings(
  value: unknown,
): ContactPortalSettings {
  const parsed = contactPortalSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { ...DEFAULT_CONTACT_PORTAL_SETTINGS };
}

/** Strip password hash from API responses; expose `portalPasswordSet` instead. */
export function toPublicContact(row: ContactRow) {
  const { portalPasswordHash, portalSettings, ...rest } = row;
  return {
    ...rest,
    portalUsername: row.portalUsername ?? null,
    portalPasswordSet: Boolean(portalPasswordHash),
    portalSettings: normalizeContactPortalSettings(portalSettings),
  };
}
