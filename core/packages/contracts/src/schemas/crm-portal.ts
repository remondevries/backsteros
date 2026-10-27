import { z } from "zod";

import { isoDateSchema, nullableIsoDateSchema, taskStatusSchema } from "./common.js";
export const organizationInputSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  summary: z.string().max(2000).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  email: z.string().email().nullable().optional(),
  emails: z
    .array(
      z.object({
        label: z.enum(["general", "support", "other"]),
        address: z.string().email().max(320),
      }),
    )
    .max(20)
    .optional(),
  phones: z
    .array(
      z.object({
        label: z.enum(["general", "support", "other"]),
        number: z.string().min(1).max(64),
      }),
    )
    .max(20)
    .optional(),
  website: z
    .union([z.string().url(), z.literal(""), z.null()])
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  region: z.string().max(128).nullable().optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  size: z.string().max(64).nullable().optional(),
  socialAccounts: z
    .array(
      z.object({
        platform: z.string().min(1).max(64),
        url: z.string().min(1).max(2048),
      }),
    )
    .max(20)
    .optional(),
  chamberOfCommerce: z.string().max(64).nullable().optional(),
  taxNumber: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  /** Moneybird contact id (string — large integer). */
  moneybirdContactId: z.string().max(64).nullable().optional(),
  /** Avatar blob key — set via avatar PUT / sync, not typical REST create. */
  avatarStorageKey: z.string().nullable().optional(),
  avatarContentType: z.string().nullable().optional(),
});

export const updateOrganizationSchema = organizationInputSchema.partial();

export const organizationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  number: z.number().int().nullable(),
  key: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  emails: z.array(
    z.object({
      label: z.enum(["general", "support", "other"]),
      address: z.string(),
    }),
  ),
  phones: z.array(
    z.object({
      label: z.enum(["general", "support", "other"]),
      number: z.string(),
    }),
  ),
  website: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  size: z.string().nullable(),
  socialAccounts: z.array(
    z.object({
      platform: z.string(),
      url: z.string(),
    }),
  ),
  chamberOfCommerce: z.string().nullable(),
  taxNumber: z.string().nullable(),
  avatarStorageKey: z.string().nullable(),
  avatarContentType: z.string().nullable(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  moneybirdContactId: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const contactSocialAccountSchema = z.object({
  platform: z.string().min(1).max(64),
  url: z.string().min(1).max(500),
});

/** Calendar day YYYY-MM-DD (finance ledger booked_on, contact birthday). */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Per-contact client portal preferences / ACL. */
export const contactPortalSettingsSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const raw = value as Record<string, unknown>;
    if (Array.isArray(raw.languages)) return raw;
    // Migrate legacy single `language` into `languages`.
    if (typeof raw.language === "string" && raw.language.trim()) {
      const { language: _legacy, ...rest } = raw;
      return { ...rest, languages: [raw.language] };
    }
    return raw;
  },
  z.object({
    /** Preferred portal languages (flag chips; first is primary when relevant). */
    languages: z
      .array(z.enum(["nl", "en", "de", "es", "fr", "pl"]))
      .default([]),
    /**
     * Project ids visible in the portal.
     * `null` = all organization projects (default); `[]` = none; otherwise allowlist.
     */
    enabledProjectIds: z.array(z.string().min(1)).nullable().default(null),
    financials: z.boolean().default(true),
    support: z.boolean().default(true),
    /** Allow creating support tickets from the portal. */
    canAddTickets: z.boolean().default(true),
    /** Allow creating tasks on project boards from the portal. */
    canAddTasks: z.boolean().default(true),
  }),
);

export type ContactPortalSettings = z.infer<typeof contactPortalSettingsSchema>;

export const DEFAULT_CONTACT_PORTAL_SETTINGS: ContactPortalSettings = {
  languages: [],
  enabledProjectIds: null,
  financials: true,
  support: true,
  canAddTickets: true,
  canAddTasks: true,
};

export const portalAuthLoginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(8).max(256),
});

export const portalContactLogKindSchema = z.enum(["login", "project_view"]);

export type PortalContactLogKind = z.infer<typeof portalContactLogKindSchema>;

export const createPortalContactLogSchema = z.object({
  kind: portalContactLogKindSchema,
  projectId: z.string().trim().min(1).optional(),
  occurredAt: isoDateSchema.optional(),
});

export type CreatePortalContactLogInput = z.infer<
  typeof createPortalContactLogSchema
>;

export const portalContactLogSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  kind: portalContactLogKindSchema,
  projectId: z.string().nullable(),
  projectName: z.string().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  occurredAt: z.string(),
  createdAt: z.string(),
});

export type PortalContactLog = z.infer<typeof portalContactLogSchema>;

export const portalContactLogListSchema = z.object({
  logs: z.array(portalContactLogSchema),
});

const contactWritableFieldsSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  organizationId: z.string().nullable().optional(),
  /**
   * Preferred given name. When omitted on create, `name` is treated as firstName
   * (legacy clients).
   */
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().max(255).nullable().optional(),
  /**
   * Full display name. Preferred to derive from firstName + lastName; accepted
   * alone for legacy create/patch as firstName when firstName is omitted.
   */
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().nullable().optional(),
  /** Labeled addresses including primary (`{ label, address }[]`, max 20). */
  emails: z
    .array(
      z.object({
        label: z.enum(["personal", "work", "other"]),
        address: z.string().email(),
      }),
    )
    .max(20)
    .optional(),
  title: z.string().max(255).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  phone: z.string().max(64).nullable().optional(),
  /** Labeled numbers including primary (`{ label, number }[]`, max 20). */
  phones: z
    .array(
      z.object({
        label: z.enum(["personal", "work", "other"]),
        number: z.string().min(1).max(64),
      }),
    )
    .max(20)
    .optional(),
  role: z.string().max(255).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  /** State / province / region name or code. */
  region: z.string().max(128).nullable().optional(),
  /** IANA timezone for this contact (e.g. Europe/Amsterdam). */
  timezone: z.string().min(1).max(128).nullable().optional(),
  /** Geocoded coordinates from Mapbox (null until resolved). */
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema).max(20).optional(),
  /**
   * Facebook Messenger Page-Scoped ID (Chatwoot). Not a public username.
   * Null/empty clears.
   */
  facebookMessengerId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .nullable()
    .optional(),
  /**
   * Numeric X (Twitter) user id for Chatwoot / Grok Bot DMs. Never an @handle.
   * Null clears.
   */
  xUserId: z
    .string()
    .trim()
    .regex(/^[0-9]{1,32}$/)
    .nullable()
    .optional(),
  /** Full calendar date YYYY-MM-DD; year required (yearless deferred). */
  birthday: calendarDateSchema.nullable().optional(),
  /** Spoken / preferred languages (`nl` | `en` | `de` | `es` | `fr` | `pl`). */
  languages: z
    .array(z.enum(["nl", "en", "de", "es", "fr", "pl"]))
    .max(5)
    .optional(),
  /** Avatar blob key — set via avatar PUT / sync, not typical REST create. */
  avatarStorageKey: z.string().nullable().optional(),
  avatarContentType: z.string().nullable().optional(),
  /** Portal avatar blob key — set via `avatar_portal` PUT / sync. */
  portalAvatarStorageKey: z.string().nullable().optional(),
  portalAvatarContentType: z.string().nullable().optional(),
  /** Client portal login username (unique per workspace when set). */
  portalUsername: z.string().trim().min(1).max(128).nullable().optional(),
  /**
   * Write-only portal password. Null/empty clears the stored hash.
   * Never returned from the API — see `portalPasswordSet`.
   */
  portalPassword: z
    .union([z.string().min(8).max(256), z.literal(""), z.null()])
    .optional(),
  /** Set by sync replication after hashing — not for public clients. */
  portalPasswordHash: z.string().nullable().optional(),
  /** Portal module ACL / language for this contact. */
  portalSettings: contactPortalSettingsSchema.nullable().optional(),
});

export const contactInputSchema = contactWritableFieldsSchema.superRefine(
  (value, ctx) => {
    if (!(value.firstName?.trim() || value.name?.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "firstName or name is required",
        path: ["firstName"],
      });
    }
  },
);

export const updateContactSchema = contactWritableFieldsSchema.partial();

export const contactSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  organizationId: z.string().nullable(),
  number: z.number().int().nullable(),
  key: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  emails: z.array(
    z.object({
      label: z.enum(["personal", "work", "other"]),
      address: z.string(),
    }),
  ),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  avatarStorageKey: z.string().nullable(),
  avatarContentType: z.string().nullable(),
  /** Client portal avatar — not the personal contact photo. */
  portalAvatarStorageKey: z.string().nullable().optional(),
  portalAvatarContentType: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  phone: z.string().nullable(),
  phones: z.array(
    z.object({
      label: z.enum(["personal", "work", "other"]),
      number: z.string(),
    }),
  ),
  role: z.string().nullable(),
  notes: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema),
  facebookMessengerId: z.string().nullable().optional(),
  /** Numeric X user id (never an @handle). */
  xUserId: z
    .string()
    .regex(/^[0-9]{1,32}$/)
    .nullable()
    .optional(),
  birthday: calendarDateSchema.nullable().optional(),
  languages: z.array(z.enum(["nl", "en", "de", "es", "fr", "pl"])),
  portalUsername: z.string().nullable().optional(),
  /** True when a portal password hash is stored (hash itself is never returned). */
  portalPasswordSet: z.boolean().optional(),
  portalSettings: contactPortalSettingsSchema.nullable().optional(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Compose full contact display name from given + family name. */
export function formatContactDisplayName(
  firstName: string,
  lastName?: string | null,
): string {
  return [firstName.trim(), (lastName ?? "").trim()]
    .filter((part) => part.length > 0)
    .join(" ");
}

/** Directed contact↔contact relationship types (presets + custom slugs). */
export const CONTACT_RELATIONSHIP_PRESET_TYPES = [
  "spouse",
  "partner",
  "child",
  "parent",
  "sibling",
  "friend",
  "colleague",
  "reports_to",
  "other",
] as const;

export const contactRelationshipPresetTypeSchema = z.enum(
  CONTACT_RELATIONSHIP_PRESET_TYPES,
);

/**
 * Preset snake_case values, or a custom slug (`son`, `best_friend`, …).
 * Display labels are derived / stored separately in the UI.
 */
export const contactRelationshipTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/,
    "Use a lowercase slug (letters, numbers, underscores)",
  );

export const contactRelationshipInputSchema = z.object({
  toContactId: z.string().min(1),
  type: contactRelationshipTypeSchema,
  note: z.string().max(2000).nullable().optional(),
});

export const updateContactRelationshipSchema = z.object({
  type: contactRelationshipTypeSchema.optional(),
  note: z.string().max(2000).nullable().optional(),
});

export const contactRelationshipSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  fromContactId: z.string(),
  toContactId: z.string(),
  type: contactRelationshipTypeSchema,
  note: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** List item for a contact's relationships (both edge directions). */
export const contactRelationshipListItemSchema = contactRelationshipSchema.extend({
  direction: z.enum(["outgoing", "incoming"]),
  typeLabel: z.string(),
  relatedContactId: z.string(),
  relatedContactName: z.string(),
});

/** Workspace catalog of bidirectional relationship labels (Parent ↔ Child). */
export const crmRelationshipLabelInputSchema = z.object({
  sideALabel: z.string().trim().min(1).max(64),
  sideBLabel: z.string().trim().min(1).max(64),
  sideASlug: contactRelationshipTypeSchema.optional(),
  sideBSlug: contactRelationshipTypeSchema.optional(),
  color: z.string().max(32).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCrmRelationshipLabelSchema =
  crmRelationshipLabelInputSchema.partial();

export const crmRelationshipLabelSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  sideALabel: z.string(),
  sideASlug: contactRelationshipTypeSchema,
  sideBLabel: z.string(),
  sideBSlug: contactRelationshipTypeSchema,
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const crmGroupSubjectTypeSchema = z.enum(["contact", "organization"]);

export const crmGroupInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().max(32).nullable().optional(),
  icon: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCrmGroupSchema = crmGroupInputSchema.partial();

export const crmGroupSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const crmGroupMemberInputSchema = z.object({
  subjectType: crmGroupSubjectTypeSchema,
  subjectId: z.string().min(1),
});

export const crmGroupMemberSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  groupId: z.string(),
  subjectType: crmGroupSubjectTypeSchema,
  subjectId: z.string(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Cap note bodies so they stay Tier A (no object-storage Tier C/D). */
export const CRM_ACTIVITY_NOTE_MAX_CHARS = 8192;

export const CRM_ACTIVITY_PREVIEW_MAX_CHARS = 240;

export const crmActivityKindSchema = z.enum(["note", "meeting"]);

export const crmActivitySubjectTypeSchema = z.enum(["contact", "organization"]);

export const createCrmActivityNoteSchema = z.object({
  kind: z.literal("note"),
  body: z.string().min(1).max(CRM_ACTIVITY_NOTE_MAX_CHARS),
  occurredAt: isoDateSchema.optional(),
});

export const crmActivitySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  subjectType: crmActivitySubjectTypeSchema,
  subjectId: z.string(),
  kind: crmActivityKindSchema,
  body: z.string().nullable(),
  bodyPreview: z.string().nullable(),
  meetingId: z.string().nullable(),
  /** Meeting title when kind=meeting (joined; not stored as SoT). */
  meetingTitle: z.string().nullable().optional(),
  /** Meeting start when kind=meeting (joined). */
  meetingStartAt: isoDateSchema.nullable().optional(),
  occurredAt: isoDateSchema,
  createdBy: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const crmActivityFeedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const crmActivityFeedResponseSchema = z.object({
  activities: z.array(crmActivitySchema),
  nextCursor: z.string().nullable(),
});

export const areaParentSchema = z.enum(["personal", "business", "clients"]);

export const areaInputSchema = z.object({
  name: z.string().min(1).max(255),
  parent: areaParentSchema,
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateAreaSchema = areaInputSchema.partial();

export const areaSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  parent: areaParentSchema.nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const letterInputSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  projectId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  title: z.string().min(1).max(500),
  icon: z.string().max(128).nullable().optional(),
  context: z.string().max(20_000).nullable().optional(),
  status: taskStatusSchema.optional(),
  dueDate: isoDateSchema.nullable().optional(),
  receivedDate: isoDateSchema.nullable().optional(),
  direction: z.enum(["incoming", "outgoing"]).optional(),
  originalFilename: z.string().max(255).optional(),
  storageKey: z.string().max(1024).optional(),
  contentType: z.string().max(255).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  checksum: z.string().max(128).nullable().optional(),
  contentEtag: z.string().max(128).nullable().optional(),
  extractedText: z.string().max(2_000_000).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateLetterSchema = letterInputSchema.partial();

export const triageLetterSchema = letterInputSchema
  .pick({
    projectId: true,
    organizationId: true,
    contactId: true,
    status: true,
    dueDate: true,
  })
  .partial();

export const letterSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  number: z.number().int().nullable(),
  projectId: z.string().nullable(),
  organizationId: z.string().nullable(),
  contactId: z.string().nullable(),
  title: z.string(),
  icon: z.string().nullable(),
  context: z.string().nullable(),
  status: z.string(),
  dueDate: nullableIsoDateSchema,
  receivedDate: nullableIsoDateSchema,
  direction: z.string(),
  storageKey: z.string(),
  originalFilename: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  contentEtag: z.string().nullable(),
  extractedText: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const letterAttachmentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  letterId: z.string(),
  storageKey: z.string(),
  originalFilename: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  contentEtag: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const letterAttachmentParamsSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
});

export const letterAttachmentsResponseSchema = z.object({
  attachments: z.array(letterAttachmentSchema),
});

export const updateLetterAttachmentSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
});

export const reorderLetterAttachmentsSchema = z.object({
  orderedIds: z.array(z.string()).min(1).max(100),
});

export const avatarParamsSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
});

export const avatarSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  storageKey: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string(),
  contentEtag: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const avatarSignedUrlQuerySchema = z.object({
  /** Desired TTL in seconds (clamped server-side; default 7 days, max 30 days). */
  ttlSeconds: z.coerce.number().int().positive().optional(),
});

export const avatarSignedUrlSchema = z.object({
  url: z.string().url(),
  expiresAt: isoDateSchema,
});

export const publicAvatarQuerySchema = z.object({
  exp: z.coerce.number().int().positive(),
  sig: z.string().min(32).max(128),
  ws: z.string().min(1),
});

export type Organization = z.infer<typeof organizationSchema>;

export type Contact = z.infer<typeof contactSchema>;

export type ContactSocialAccount = z.infer<typeof contactSocialAccountSchema>;

export type ContactRelationshipType = z.infer<typeof contactRelationshipTypeSchema>;

export type ContactRelationship = z.infer<typeof contactRelationshipSchema>;

export type ContactRelationshipListItem = z.infer<
  typeof contactRelationshipListItemSchema
>;

export type ContactRelationshipInput = z.infer<typeof contactRelationshipInputSchema>;

export type UpdateContactRelationshipInput = z.infer<
  typeof updateContactRelationshipSchema
>;

export type CrmRelationshipLabel = z.infer<typeof crmRelationshipLabelSchema>;

export type CrmRelationshipLabelInput = z.infer<
  typeof crmRelationshipLabelInputSchema
>;

export type UpdateCrmRelationshipLabelInput = z.infer<
  typeof updateCrmRelationshipLabelSchema
>;

export type CrmGroup = z.infer<typeof crmGroupSchema>;

export type CrmGroupInput = z.infer<typeof crmGroupInputSchema>;

export type CrmGroupMember = z.infer<typeof crmGroupMemberSchema>;

export type CrmGroupMemberInput = z.infer<typeof crmGroupMemberInputSchema>;

export type CrmGroupSubjectType = z.infer<typeof crmGroupSubjectTypeSchema>;

export type CrmActivity = z.infer<typeof crmActivitySchema>;

export type CrmActivityKind = z.infer<typeof crmActivityKindSchema>;

export type CreateCrmActivityNoteInput = z.infer<typeof createCrmActivityNoteSchema>;

export type Area = z.infer<typeof areaSchema>;

export type AreaParent = z.infer<typeof areaParentSchema>;

export type AreaInput = z.infer<typeof areaInputSchema>;

export type Letter = z.infer<typeof letterSchema>;

export type LetterAttachment = z.infer<typeof letterAttachmentSchema>;

export type Avatar = z.infer<typeof avatarSchema>;

export type AvatarSignedUrl = z.infer<typeof avatarSignedUrlSchema>;
