import { z } from "zod";
export const TASK_STATUSES = [
  "triage",
  "backlog",
  "ready_to_start",
  "in_progress",
  "on_hold",
  "waiting",
  "in_review",
  "completed",
  "canceled",
  "duplicated",
] as const;

export const PROJECT_STATUSES = [
  "backlog",
  "active",
  "on_hold",
  "completed",
  "canceled",
] as const;

/** Extensible project kinds — development console filters on `codebase`. */
export const PROJECT_TYPES = [
  "general",
  "codebase",
  "it_service",
  "webhosting",
  "domeinname",
  "email",
] as const;

/** Registrar / hosting providers (Catalog Domains; extensible). */
export const PROJECT_PROVIDERS = ["transip"] as const;

/** Email providers for `type = email` projects (Catalog; extensible). */
export const PROJECT_EMAIL_CATEGORIES = [
  "lemo_hosting",
  "google_workspaces",
  "office365",
  "proton",
] as const;

export const DOCUMENT_TYPES = ["project", "knowledge", "journal"] as const;

export const API_KEY_SCOPES = [
  "projects:read",
  "projects:write",
  "tasks:read",
  "tasks:write",
  "documents:read",
  "documents:write",
  "letters:read",
  "letters:write",
  "organizations:read",
  "organizations:write",
  "contacts:read",
  "contacts:write",
  "finance:read",
  "finance:write",
  "settings:read",
  "settings:write",
  "avatars:read",
  "avatars:write",
  "search:query",
  /** CardDAV door only — unlocks contacts.backsteros.com address book sync. */
  "carddav",
  /**
   * TV today-counts door only (OS-137) — snapshot + SSE counts payload.
   * Mint alone on a key so it stays independently revocable.
   */
  "tv.today_counts",
  /**
   * Applications door only — mint alone on a key for app integrations
   * (Settings → API keys → Applications).
   */
  "applications",
] as const;

/** Open statuses shown on TV / Dynamic Island today-counts (Island order). */
export const TV_TODAY_COUNT_STATUSES = [
  "triage",
  "backlog",
  "ready_to_start",
  "in_progress",
  "on_hold",
  "in_review",
] as const;

export const tvTodayCountStatusSchema = z.enum(TV_TODAY_COUNT_STATUSES);

/** Counts-only payload for TV home (OS-137) — no task ids, titles, or bodies. */
export const tvTodayCountsSchema = z.object({
  dueTodayTotal: z.number().int().nonnegative(),
  statuses: z.array(
    z.object({
      status: tvTodayCountStatusSchema,
      count: z.number().int().positive(),
    }),
  ),
  agentsWorking: z.number().int().nonnegative(),
});

/** @deprecated Prefer BANK_ACCOUNT_TYPES — kept for older clients during transition. */
export const BANK_ACCOUNT_INSTITUTIONS = ["ing", "amex", "other"] as const;

export const BANK_ACCOUNT_TYPES = [
  "bank_account",
  "credit_card",
  "savings",
  "investment",
] as const;

export const FINANCIAL_CATEGORY_KINDS = [
  "income",
  "expense",
  "transfer",
] as const;

export const FINANCIAL_CATEGORY_LISTINGS = ["regular", "excluded"] as const;

export const FINANCIAL_GOAL_LISTINGS = [
  "active",
  "ready_to_spend",
  "archive",
] as const;

export const FINANCIAL_GOAL_SAVING_MODES = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;

export const FINANCIAL_IMPORT_DIALECTS = [
  "ing_nl",
  "amex_nl",
  "unknown",
] as const;

export const FINANCIAL_AMOUNT_SIGNS = ["all", "debit", "credit"] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export const projectTypeSchema = z.enum(PROJECT_TYPES);

export const projectProviderSchema = z.enum(PROJECT_PROVIDERS);

export const projectEmailCategorySchema = z.enum(PROJECT_EMAIL_CATEGORIES);

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

export const bankAccountInstitutionSchema = z.enum(BANK_ACCOUNT_INSTITUTIONS);

export const bankAccountTypeSchema = z.enum(BANK_ACCOUNT_TYPES);

export const financialCategoryKindSchema = z.enum(FINANCIAL_CATEGORY_KINDS);

export const financialCategoryListingSchema = z.enum(
  FINANCIAL_CATEGORY_LISTINGS,
);

export const financialGoalListingSchema = z.enum(FINANCIAL_GOAL_LISTINGS);

export const financialGoalSavingModeSchema = z.enum(
  FINANCIAL_GOAL_SAVING_MODES,
);

export const financialImportDialectSchema = z.enum(FINANCIAL_IMPORT_DIALECTS);

export const financialAmountSignSchema = z.enum(FINANCIAL_AMOUNT_SIGNS);

/** GitHub `owner/repo` full name bound to a codebase project. */
export const githubRepositoryNameSchema = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/, "Use owner/repo");

export const errorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export const validationIssueSchema = z.object({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
}).passthrough();

export const validationErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    issues: z.array(validationIssueSchema),
    name: z.literal("ZodError"),
  }),
});

/** The API uses both explicit errors and Hono's serialized Zod validation result. */
export const badRequestSchema = z.union([errorSchema, validationErrorSchema]);

/** Git/build identity exposed on `/health` and `/api/v1/health` (OS-61). */
export const buildVersionSchema = z.object({
  commit: z.string(),
  builtAt: z.string(),
  dirty: z.boolean(),
});

export const healthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: buildVersionSchema,
  spacesConfigured: z.boolean(),
  /** True when this core's commit differs from the replication peer's `/health`. */
  versionMismatch: z.boolean().optional(),
  peerVersion: buildVersionSchema.nullable().optional(),
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  contactId: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  lastUsedAddress: z.string().nullable(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  /** True when the full secret is stored encrypted and can be revealed for copy. */
  hasRecoverableSecret: z.boolean(),
});

export const revealApiKeySecretResponseSchema = z.object({
  secret: z.string(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(apiKeyScopeSchema).min(1),
  contactId: z.string().nullable().optional(),
  /** Optional expiry; omit or null for no expiry. */
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updateApiKeySchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    contactId: z.string().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.contactId !== undefined ||
      value.expiresAt !== undefined,
    {
      message: "At least one field is required",
    },
  );

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeySchema,
  secret: z.string(),
});

export const apiKeyAuditLogActionSchema = z.enum([
  "created",
  "revoked",
  "rotated",
  /** expiresAt cleared, set, extended, or otherwise changed (includes revive). */
  "expiry_updated",
]);

export const apiKeyAuditLogSchema = z.object({
  id: z.string(),
  apiKeyId: z.string().nullable(),
  apiKeyName: z.string(),
  action: apiKeyAuditLogActionSchema,
  actorUserId: z.string().nullable(),
  actorKind: z.string().nullable(),
  actorApiKeyId: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const listApiKeyAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const apiKeyRequestLogSchema = z.object({
  id: z.string(),
  apiKeyId: z.string().nullable(),
  apiKeyName: z.string(),
  method: z.string(),
  path: z.string(),
  status: z.number().int(),
  address: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const listApiKeyRequestLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Max page size for GET /api/v1/documents (same band as activities / ops logs). */
export const DOCUMENT_LIST_MAX_LIMIT = 200;

/** Shared list pagination (OS-59) — opt in with `paginated=true` or `cursor`. */
export const LIST_DEFAULT_LIMIT = 50;

export const LIST_MAX_LIMIT = 200;

export const DOCUMENTS_DEFAULT_LIMIT = 100;

export const listPaginationQuerySchema = z.object({
  paginated: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).optional(),
  updatedSince: z.string().optional(),
});

export const listProjectsQuerySchema = listPaginationQuerySchema.extend({
  organizationId: z.string().optional(),
  area: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});

export const listMeetingsQuerySchema = listPaginationQuerySchema.extend({
  projectId: z.string().optional(),
  organizationId: z.string().optional(),
  contactId: z.string().optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
});

export const listOrganizationsQuerySchema = listPaginationQuerySchema.extend({
  q: z.string().optional(),
  search: z.string().optional(),
});

export const listContactsQuerySchema = listPaginationQuerySchema.extend({
  organizationId: z.string().optional(),
  q: z.string().optional(),
  search: z.string().optional(),
});

export const listLettersQuerySchema = listPaginationQuerySchema.extend({
  projectId: z.string().optional(),
  organizationId: z.string().optional(),
  contactId: z.string().optional(),
  status: z.string().optional(),
  triage: z.coerce.boolean().optional(),
});

export const listEmailMessagesQuerySchema = listPaginationQuerySchema.extend({
  status: z.string().optional(),
});

export const listDueTasksQuerySchema = z.object({
  before: z.string().datetime().optional(),
  paginated: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).optional(),
});

export const globalSearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).optional(),
  mode: z
    .enum([
      "all",
      "projects",
      "tasks",
      "documents",
      "letters",
      "knowledge",
      "contacts",
      "organizations",
    ])
    .optional(),
  contextKind: z.string().optional(),
  projectId: z.string().optional(),
  projectSection: z.string().optional(),
  contactId: z.string().optional(),
  contactSection: z.string().optional(),
  organizationId: z.string().optional(),
  organizationSection: z.string().optional(),
});

export const listPaginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

/** Accept a single query string or repeated keys (`?type=a&type=b`). */
const optionalQueryString = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value == null) return undefined;
    return Array.isArray(value) ? value.join(",") : value;
  });

/**
 * Query for GET /api/v1/documents.
 * When `limit` is omitted, the route applies DOCUMENTS_DEFAULT_LIMIT (100)
 * and sets `X-BacksterOS-Hint` (OS-59). When set, clamped to 1..DOCUMENT_LIST_MAX_LIMIT.
 * `type` must be a structural document type (knowledge|project|journal) or a
 * known semantic property type (house-rule, runbook, …).
 */
export const listDocumentsQuerySchema = z.object({
  /**
   * Structural document type (knowledge|project|journal) or semantic property
   * type from the index (e.g. house-rule). Comma-separated / repeated for multi-value.
   */
  type: optionalQueryString,
  projectId: z.string().optional(),
  /** Property audience filter (comma-separated or repeated). */
  audience: optionalQueryString,
  /** Property status filter (comma-separated or repeated). */
  status: optionalQueryString,
  limit: z.coerce.number().int().min(1).max(DOCUMENT_LIST_MAX_LIMIT).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const isoDateSchema = z.string().datetime();

export const nullableIsoDateSchema = isoDateSchema.nullable();

export const idParamsSchema = z.object({
  /** Internal id or human key (task `OS-51`, project `OS`, org/contact key). */
  id: z.string(),
});

export const syncEntitySchema = z.enum(["project", "task", "document"]);

export const syncOperationSchema = z.enum(["upsert", "delete"]);

export const syncChangeSchema = z.object({
  entity: syncEntitySchema,
  entity_id: z.string(),
  operation: syncOperationSchema,
  payload: z.record(z.unknown()),
  updated_at: z.number().int(),
});

export const syncPushSchema = z.object({
  schema_version: z.number().int(),
  device_id: z.string().min(1),
  mutations: z
    .array(z.object({ id: z.string().min(1), changes: z.array(syncChangeSchema).min(1) }))
    .min(1)
    .max(100),
});

const syncProjectSchema = z.record(z.unknown());

const syncTaskSchema = z.record(z.unknown());

const syncDocumentSchema = z.record(z.unknown());

export const syncBootstrapSchema = z.object({
  schema_version: z.number().int(),
  cursor: z.number().int(),
  /** Alias of `cursor` — Linear-style lastSyncId on this core. */
  last_sync_id: z.number().int().optional(),
  spaces_configured: z.boolean(),
  snapshot: z.object({
    projects: z.array(syncProjectSchema),
    tasks: z.array(syncTaskSchema),
    documents: z.array(syncDocumentSchema),
  }),
});

export const syncPullSchema = z.object({
  schema_version: z.number().int(),
  cursor: z.number().int(),
  /** Alias of `cursor` — Linear-style lastSyncId on this core. */
  last_sync_id: z.number().int().optional(),
  has_more: z.boolean(),
  events: z.array(
    z.object({
      cursor: z.number().int(),
      mutation_id: z.string(),
      device_id: z.string().nullable(),
      entity: syncEntitySchema,
      entity_id: z.string(),
      operation: syncOperationSchema,
      payload: z.record(z.unknown()),
      created_at: z.number().int(),
    }),
  ),
});

export const syncPushResponseSchema = z.object({
  schema_version: z.number().int(),
  cursor: z.number().int(),
  last_sync_id: z.number().int().optional(),
  accepted_mutation_ids: z.array(z.string()),
});

export const powerSyncCredentialsSchema = z.object({
  endpoint: z.string().url(),
  token: z.string(),
  audience: z.string(),
});

export const powerSyncWriteSchema = z.object({
  device_id: z.string().optional(),
  batch: z
    .array(
      z.object({
        table: z.string(),
        op: z.enum(["PUT", "PATCH", "DELETE"]),
        id: z.string(),
        data: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const okSchema = z.object({ ok: z.literal(true) });

export type ApiKey = z.infer<typeof apiKeySchema>;

export type ApiKeyAuditLog = z.infer<typeof apiKeyAuditLogSchema>;

export type ApiKeyAuditLogAction = z.infer<typeof apiKeyAuditLogActionSchema>;

export type ApiKeyRequestLog = z.infer<typeof apiKeyRequestLogSchema>;

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export type RevealApiKeySecretResponse = z.infer<
  typeof revealApiKeySecretResponseSchema
>;

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export type TvTodayCountStatus = (typeof TV_TODAY_COUNT_STATUSES)[number];

export type TvTodayCounts = z.infer<typeof tvTodayCountsSchema>;

export type DocumentType = z.infer<typeof documentTypeSchema>;

export type BankAccountInstitution = z.infer<typeof bankAccountInstitutionSchema>;

export type BankAccountType = z.infer<typeof bankAccountTypeSchema>;

export type FinancialCategoryKind = z.infer<typeof financialCategoryKindSchema>;

export type FinancialCategoryListing = z.infer<
  typeof financialCategoryListingSchema
>;

export type FinancialGoalListing = z.infer<typeof financialGoalListingSchema>;

export type FinancialGoalSavingMode = z.infer<
  typeof financialGoalSavingModeSchema
>;

export type FinancialImportDialect = z.infer<typeof financialImportDialectSchema>;

export type FinancialAmountSign = z.infer<typeof financialAmountSignSchema>;

export type PowerSyncCredentials = z.infer<typeof powerSyncCredentialsSchema>;

export type PowerSyncWriteInput = z.infer<typeof powerSyncWriteSchema>;
