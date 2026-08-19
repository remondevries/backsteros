import { z } from "zod";

export const TASK_STATUSES = [
  "triage",
  "backlog",
  "ready_to_start",
  "in_progress",
  "on_hold",
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
] as const;

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

export const healthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
  spacesConfigured: z.boolean(),
});

/** Project short ID — 2–3 alphanumeric characters (any case; stored uppercase). */
export const projectKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9]{2,3}$/, "Use 2–3 letters or numbers");

export const projectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  organizationId: z.string().nullable(),
  areaId: z.string().nullable(),
  area: z.enum(["personal", "business", "clients"]).nullable(),
  startDate: z.string().datetime().nullable(),
  dueDate: z.string().datetime().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  type: projectTypeSchema,
  githubRepository: githubRepositoryNameSchema.nullable(),
  /** Absolute local folder for agent/PTY (machine-specific; Development console). */
  localWorkingDirectory: z.string().max(4096).nullable(),
  status: projectStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createProjectSchema = z.object({
  key: projectKeySchema,
  name: z.string().min(1).max(255),
  summary: z.string().max(2000).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  organizationId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  area: z.enum(["personal", "business", "clients"]).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  type: projectTypeSchema.optional(),
  githubRepository: githubRepositoryNameSchema.nullable().optional(),
  localWorkingDirectory: z.string().max(4096).nullable().optional(),
  status: projectStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
});

export const githubRepositorySchema = z.object({
  id: z.number().int(),
  fullName: z.string(),
  name: z.string(),
  ownerLogin: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
  htmlUrl: z.string(),
  description: z.string().nullable(),
});

export const githubBranchSchema = z.object({
  name: z.string(),
  protected: z.boolean(),
  commitSha: z.string().nullable(),
});

export const githubCommitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  message: z.string(),
  authorName: z.string().nullable(),
  authorLogin: z.string().nullable(),
  authoredAt: z.string().datetime().nullable(),
  htmlUrl: z.string(),
});

/** Derived from GitHub `state` + `merged_at` (merged PRs arrive as `closed`). */
export const githubPullRequestStateSchema = z.enum([
  "open",
  "closed",
  "merged",
]);

export const githubPullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: githubPullRequestStateSchema,
  draft: z.boolean(),
  body: z.string().nullable(),
  authorLogin: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
  mergedAt: z.string().datetime().nullable(),
  htmlUrl: z.string(),
  headRef: z.string().nullable(),
  baseRef: z.string().nullable(),
  commitsCount: z.number().int().nonnegative().nullable(),
  commentsCount: z.number().int().nonnegative().nullable(),
  changedFilesCount: z.number().int().nonnegative().nullable(),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
});

export const githubPullRequestFileStatusSchema = z.enum([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged",
]);

export const githubPullRequestFileSchema = z.object({
  filename: z.string(),
  previousFilename: z.string().nullable(),
  status: githubPullRequestFileStatusSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changes: z.number().int().nonnegative(),
  patch: z.string().nullable(),
  blobUrl: z.string().nullable(),
  rawUrl: z.string().nullable(),
});

/** OAuth scopes required for personal + organization repository access. */
export const GITHUB_INTEGRATION_SCOPES = ["repo", "read:org"] as const;

export const githubOrganizationSchema = z.object({
  id: z.number().int(),
  login: z.string(),
  avatarUrl: z.string().nullable(),
});

export const githubConnectionStatusSchema = z.object({
  connected: z.boolean(),
  login: z.string().nullable(),
  scopes: z.array(z.string()),
  requiredScopes: z.array(z.string()),
  missingScopes: z.array(z.string()),
  organizations: z.array(githubOrganizationSchema),
  repositoryCount: z.number().int().nonnegative().nullable(),
  reason: z.string().nullable(),
});

/** Relative path under a project's localWorkingDirectory (POSIX-style). */
export const projectFsRelativePathSchema = z
  .string()
  .max(4096)
  .regex(/^[^\\]*$/, "Use forward slashes only");

export const projectFsEntryKindSchema = z.enum(["file", "directory"]);

export const projectFsEntrySchema = z.object({
  name: z.string(),
  /** Relative path from working directory root ("" for root itself in list path). */
  path: z.string(),
  kind: projectFsEntryKindSchema,
});

export const projectFsListEntriesResponseSchema = z.object({
  path: z.string(),
  entries: z.array(projectFsEntrySchema),
});

export const projectFsFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative(),
  binary: z.boolean(),
  content: z.string().nullable(),
});

export const projectFsWriteFileSchema = z.object({
  path: projectFsRelativePathSchema,
  content: z.string().max(1_500_000),
});

export const projectFsCreateEntrySchema = z.object({
  parent: projectFsRelativePathSchema,
  name: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (value) =>
        value !== "." &&
        value !== ".." &&
        !value.includes("/") &&
        !value.includes("\\") &&
        !value.includes("\0"),
      "Invalid entry name",
    ),
  kind: projectFsEntryKindSchema,
});

export const projectFsCreateEntryResponseSchema = z.object({
  path: z.string(),
  name: z.string(),
  kind: projectFsEntryKindSchema,
  parent: z.string(),
});

export const projectFsDeleteEntryResponseSchema = z.object({
  path: z.string(),
  name: z.string(),
  kind: projectFsEntryKindSchema,
  deleted: z.literal(true),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

/** Link attachment on a task (URL metadata; not blob storage). */
export const taskLinkSchema = z.object({
  id: z.string().min(1).max(64),
  url: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
});

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  contactId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  dueDate: z.string().datetime().nullable(),
  triagedAt: z.string().datetime().nullable(),
  inbox: z.boolean(),
  links: z.array(taskLinkSchema),
  /** Cursor Agent chat id bound to this task, if any. */
  agentChatId: z.string().nullable(),
  /** Habit definition this daily instance belongs to, if any. */
  habitId: z.string().nullable().optional(),
  completedAt: z.string().datetime().nullable(),
  /** Set when created via API key or agent actor. */
  agentCreatedAt: z.string().datetime().nullable().optional(),
  /** User sign-off timestamp; clears Agents inbox subgroup. */
  agentInboxApprovedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createTaskSchema = z.object({
  projectId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  triagedAt: z.string().datetime().nullable().optional(),
  inbox: z.boolean().optional(),
  links: z.array(taskLinkSchema).max(20).optional(),
  agentChatId: z.string().max(128).nullable().optional(),
  habitId: z.string().nullable().optional(),
  /**
   * Who should be attributed on activity rows for this write.
   * `agent` also flags the task for the Agents inbox subgroup.
   */
  activityActor: z.enum(["user", "agent"]).optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .extend({
    /** Clerk-only sign-off — removes task from Agents inbox subgroup. */
    agentInboxApproved: z.boolean().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).filter(
        (key) => key !== "activityActor" && key !== "agentInboxApproved",
      ).length > 0 ||
      value.agentInboxApproved === true,
    {
      message: "At least one field is required",
    },
  );

export const taskCommentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  parentCommentId: z.string().nullable(),
  authorUserId: z.string().nullable(),
  authorContactId: z.string().nullable(),
  authorEmail: z.string().nullable(),
  /** Display name: user profile name when available, else email local-part. */
  authorName: z.string(),
  body: z.string(),
  /** Set when a root comment thread is resolved. */
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createTaskCommentSchema = z.object({
  body: z.string().min(1).max(20_000),
  parentCommentId: z.string().nullable().optional(),
  /**
   * Who should be attributed as the comment author.
   * `agent` stores a null author user so the UI shows "Agent".
   */
  activityActor: z.enum(["user", "agent"]).optional(),
});

export const updateTaskCommentSchema = z
  .object({
    body: z.string().min(1).max(20_000).optional(),
    /** Pass an ISO timestamp to resolve, or null to unresolve. Only for root comments. */
    resolvedAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const taskActivityTypeSchema = z.enum([
  "created",
  "status_changed",
  "assignee_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
  "agent_worked",
]);

export const agentWorkedActivityDataSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  cacheReadTokens: z.number().int().nonnegative().nullable().optional(),
  cacheWriteTokens: z.number().int().nonnegative().nullable().optional(),
  totalTokens: z.number().int().nonnegative().nullable().optional(),
  chatId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export const createTaskActivitySchema = z.object({
  type: z.literal("agent_worked"),
  data: agentWorkedActivityDataSchema,
});

export const taskActivitySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  type: taskActivityTypeSchema,
  actorUserId: z.string().nullable(),
  actorContactId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorName: z.string(),
  data: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  contactId: z.string().nullable(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(apiKeyScopeSchema).min(1),
  contactId: z.string().nullable().optional(),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  contactId: z.string().nullable().optional(),
}).refine((value) => value.name !== undefined || value.contactId !== undefined, {
  message: "At least one field is required",
});

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeySchema,
  secret: z.string(),
});

const documentPathSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/,
    "Use letters, numbers, slashes, dots, hyphens, underscores",
  );

export const documentSchema = z.object({
  id: z.string(),
  type: documentTypeSchema,
  projectId: z.string().nullable(),
  parentId: z.string().nullable(),
  kind: z.enum(["document", "folder"]),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  journalDate: z.string().nullable(),
  path: z.string(),
  title: z.string(),
  storageKey: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  snippet: z.string().nullable(),
  contentVersion: z.number().int().positive(),
  contentEtag: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createDocumentSchema = z
  .object({
    type: documentTypeSchema,
    projectId: z.string().optional(),
    parentId: z.string().optional(),
    kind: z.enum(["document", "folder"]).optional(),
    icon: z.string().max(128).optional(),
    sortOrder: z.number().int().optional(),
    journalDate: z.string().date().optional(),
    path: documentPathSchema,
    title: z.string().min(1).max(500),
    content: z.string().max(5_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "project" && !value.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required for project documents",
        path: ["projectId"],
      });
    }
    if (value.type !== "project" && value.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is only allowed for project documents",
        path: ["projectId"],
      });
    }
  });

export const updateDocumentSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    path: documentPathSchema.optional(),
    parentId: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
    journalDate: z.string().date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const documentContentSchema = z.object({
  content: z.string(),
  contentType: z.string(),
  contentVersion: z.number().int().positive(),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const updateDocumentContentSchema = z.object({
  content: z.string().max(5_000_000),
  ifMatchVersion: z.number().int().positive().optional(),
});

export const searchResultSchema = z.object({
  id: z.string(),
  type: documentTypeSchema,
  projectId: z.string().nullable(),
  path: z.string(),
  title: z.string(),
  snippet: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

const isoDateSchema = z.string().datetime();
const nullableIsoDateSchema = isoDateSchema.nullable();

export const idParamsSchema = z.object({ id: z.string() });
export const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1).max(500),
});
export const moveTaskSchema = z.object({ projectId: z.string().nullable() });
export const triageTaskSchema = z.object({
  projectId: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
});
export const batchUpdateTasksSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: updateTaskSchema,
});

export const organizationInputSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  summary: z.string().max(2000).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  email: z.string().email().nullable().optional(),
  website: z.string().url().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  sortOrder: z.number().int().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  /** Moneybird contact id (string — large integer). */
  moneybirdContactId: z.string().max(64).nullable().optional(),
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
  website: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
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

export const contactInputSchema = z.object({
  number: z.number().int().positive().nullable().optional(),
  key: z.string().min(1).max(64),
  organizationId: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  email: z.string().email().nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  phone: z.string().max(64).nullable().optional(),
  role: z.string().max(255).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  city: z.string().max(255).nullable().optional(),
  postalCode: z.string().max(32).nullable().optional(),
  country: z.string().max(128).nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema).max(20).optional(),
});
export const updateContactSchema = contactInputSchema.partial();
export const contactSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  organizationId: z.string().nullable(),
  number: z.number().int().nullable(),
  key: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  avatarStorageKey: z.string().nullable(),
  avatarContentType: z.string().nullable(),
  sortOrder: z.number().int(),
  phone: z.string().nullable(),
  role: z.string().nullable(),
  notes: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  socialAccounts: z.array(contactSocialAccountSchema),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Calendar day YYYY-MM-DD (finance ledger booked_on). */
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const bankAccountInputSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  ibanOrMask: z.string().max(64).nullable().optional(),
  currency: z.string().min(3).max(8).optional(),
  type: bankAccountTypeSchema.optional(),
  /** Optional accent / chart color (#RGB or #RRGGBB). */
  color: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/)
    .nullable()
    .optional(),
  sortOrder: z.number().int().optional(),
});
export const updateBankAccountSchema = bankAccountInputSchema.partial();
export const bankAccountSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  key: z.string(),
  name: z.string(),
  ibanOrMask: z.string().nullable(),
  currency: z.string(),
  type: bankAccountTypeSchema,
  avatarStorageKey: z.string().nullable(),
  avatarContentType: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

/** Aggregated running balance without loading Tier C transaction rows. */
export const bankAccountBalanceSchema = z.object({
  bankAccountId: z.string(),
  balanceCents: z.number().int(),
});

export const listBankAccountBalancesResponseSchema = z.object({
  balances: z.array(bankAccountBalanceSchema),
});

/** Dashboard assets vs debt sparkline ranges. */
export const financeAssetsDebtRangeSchema = z.enum([
  "1W",
  "1M",
  "3M",
  "YTD",
  "1Y",
  "ALL",
]);

export const financeAssetsDebtQuerySchema = z.object({
  range: financeAssetsDebtRangeSchema.optional(),
});

export const financeAssetsDebtPointSchema = z.object({
  date: calendarDateSchema,
  assetsCents: z.number().int().nonnegative(),
  debtCents: z.number().int().nonnegative(),
});

export const financeAssetsDebtResponseSchema = z.object({
  range: financeAssetsDebtRangeSchema,
  asOf: calendarDateSchema,
  assetsCents: z.number().int().nonnegative(),
  debtCents: z.number().int().nonnegative(),
  /** Snapshot at the start of the selected range (for % change). */
  startAssetsCents: z.number().int().nonnegative(),
  startDebtCents: z.number().int().nonnegative(),
  points: z.array(financeAssetsDebtPointSchema),
});

/** Workspace-wide income (credits) for a calendar month. */
export const bankAccountsMonthIncomeQuerySchema = z.object({
  /** `YYYY-MM` — defaults to the current calendar month. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const bankAccountsMonthIncomeResponseSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  incomeCents: z.number().int().nonnegative(),
});

/** One calendar month of income (credits) and expense (debits as positive). */
export const bankAccountCashflowMonthSchema = z.object({
  /** `YYYY-MM` */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});

export const bankAccountCashflowQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
});

export const bankAccountCashflowResponseSchema = z.object({
  bankAccountId: z.string(),
  year: z.number().int(),
  months: z.array(bankAccountCashflowMonthSchema),
});

/** Workspace-wide monthly cashflow + YTD net income for the Cash Flow page. */
export const workspaceCashflowQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
  /** Calendar date `YYYY-MM-DD` used as YTD end (defaults to today). */
  asOf: calendarDateSchema.optional(),
});

export const workspaceCashflowResponseSchema = z.object({
  year: z.number().int(),
  /** Inclusive YTD end date (`YYYY-MM-DD`). */
  asOf: calendarDateSchema,
  months: z.array(bankAccountCashflowMonthSchema),
  /** Net income (income − expense) from Jan 1 of `year` through `asOf`. */
  ytdNetCents: z.number().int(),
  /**
   * Net income for the same calendar span in the previous year
   * (Jan 1 … same month/day of `year - 1`).
   */
  priorYtdNetCents: z.number().int(),
  ytdIncomeCents: z.number().int().nonnegative(),
  priorYtdIncomeCents: z.number().int().nonnegative(),
  ytdExpenseCents: z.number().int().nonnegative(),
  priorYtdExpenseCents: z.number().int().nonnegative(),
  /**
   * Net spend per calendar month × category (`categoryId` null = uncategorized).
   * Positive = net outflow; negative = net inflow (credits reduce spend).
   * Client rolls children into roots and caps to top categories + Other.
   */
  categoryMonths: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      categoryId: z.string().nullable(),
      expenseCents: z.number().int(),
    }),
  ),
});

/** Spend detail side panel (multi-year history + month categories). */
export const financeSpendPanelQuerySchema = z.object({
  /** `YYYY-MM` — defaults to the current calendar month. */
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  /** How many trailing months of history to include (default 36). */
  historyMonths: z.coerce.number().int().min(6).max(60).optional(),
});

export const financeSpendPanelResponseSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  monthExpenseCents: z.number().int().nonnegative(),
  history: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      expenseCents: z.number().int().nonnegative(),
    }),
  ),
  yearMetrics: z.array(
    z.object({
      year: z.number().int(),
      spendCents: z.number().int().nonnegative(),
      avgMonthlyCents: z.number().int().nonnegative(),
    }),
  ),
  categories: z.array(
    z.object({
      categoryId: z.string().nullable(),
      /** Net spend polarity: positive = outflow, negative = inflow. */
      expenseCents: z.number().int(),
    }),
  ),
});

export const financialCategoryInputSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().nullable().optional(),
  kind: financialCategoryKindSchema.optional(),
  listing: financialCategoryListingSchema.optional(),
  icon: z.string().nullable().optional(),
  /** Monthly budget in cents. Null or 0 means no budget. */
  budgetCents: z.number().int().nonnegative().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateFinancialCategorySchema = financialCategoryInputSchema.partial();
export const financialCategorySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  kind: financialCategoryKindSchema,
  listing: financialCategoryListingSchema,
  icon: z.string().nullable(),
  budgetCents: z.number().int().nonnegative().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const financialGoalInputSchema = z.object({
  name: z.string().min(1).max(255),
  listing: financialGoalListingSchema.optional(),
  icon: z.string().nullable().optional(),
  /** Target savings amount in cents. Null or 0 means no goal amount. */
  goalAmountCents: z.number().int().nonnegative().nullable().optional(),
  /** When saving for this goal should start (YYYY-MM-DD). */
  startDate: calendarDateSchema.nullable().optional(),
  /** Optional target end of the goal period (YYYY-MM-DD). */
  endDate: calendarDateSchema.nullable().optional(),
  /** Contribution per saving-mode period in cents. */
  contributionCents: z.number().int().nonnegative().nullable().optional(),
  savingMode: financialGoalSavingModeSchema.optional(),
  sortOrder: z.number().int().optional(),
});
export const updateFinancialGoalSchema = financialGoalInputSchema.partial();
export const financialGoalSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  listing: financialGoalListingSchema,
  icon: z.string().nullable(),
  goalAmountCents: z.number().int().nonnegative().nullable(),
  startDate: calendarDateSchema.nullable(),
  endDate: calendarDateSchema.nullable(),
  contributionCents: z.number().int().nonnegative().nullable(),
  savingMode: financialGoalSavingModeSchema,
  /**
   * Sum of linked transaction amounts in cents (actual deposits/spend tagged
   * to this goal). Not stored — computed on read.
   */
  savedCents: z.number().int(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const financialRecurringInputSchema = z.object({
  name: z.string().min(1).max(255),
  icon: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  /** Expected next payment amount in cents. */
  amountCents: z.number().int().nonnegative().nullable().optional(),
  /** Next expected payment date (YYYY-MM-DD). */
  nextDate: calendarDateSchema.nullable().optional(),
  /** When true, nextDate is not auto-rolled into the current month. */
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateFinancialRecurringSchema =
  financialRecurringInputSchema.partial();
export const financialRecurringSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  categoryId: z.string().nullable(),
  amountCents: z.number().int().nonnegative().nullable(),
  nextDate: calendarDateSchema.nullable(),
  archived: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const financialImportBatchSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  bankAccountId: z.string(),
  originalFilename: z.string(),
  storageKey: z.string(),
  dialect: financialImportDialectSchema,
  rowCount: z.number().int().nonnegative(),
  insertedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
});

export const financialImportResultSchema = z.object({
  batchId: z.string(),
  dialect: financialImportDialectSchema,
  rowCount: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  skippedAccountMismatch: z.number().int().nonnegative(),
});

export const financialTransactionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  bankAccountId: z.string(),
  importBatchId: z.string().nullable(),
  bookedOn: calendarDateSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  payee: z.string(),
  counterparty: z.string().nullable(),
  memo: z.string().nullable(),
  /**
   * Optional adjusted title for UI. Original payee/memo/raw are never rewritten.
   * Null/empty → clients fall back to payee → memo → counterparty.
   */
  displayName: z.string().nullable(),
  balanceAfterCents: z.number().int().nullable(),
  externalId: z.string().nullable(),
  fingerprint: z.string(),
  sourceCode: z.string().nullable(),
  sourceType: z.string().nullable(),
  /** Original CSV row columns preserved at import time. */
  raw: z.record(z.string(), z.string()).default({}),
  organizationId: z.string().nullable(),
  projectId: z.string().nullable(),
  categoryId: z.string().nullable(),
  goalId: z.string().nullable(),
  recurringId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const updateFinancialTransactionSchema = z.object({
  /** Move the transaction to another bank account in the same workspace. */
  bankAccountId: z.string().optional(),
  organizationId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  goalId: z.string().nullable().optional(),
  recurringId: z.string().nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  /** User-adjusted display title; null clears the override. */
  displayName: z.string().max(500).nullable().optional(),
});

export const batchUpdateFinancialTransactionsSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: updateFinancialTransactionSchema,
});

export const batchDeleteFinancialTransactionsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export const batchDeleteFinancialTransactionsResponseSchema = z.object({
  deleted: z.number().int().nonnegative(),
});

export const listFinancialTransactionsQuerySchema = z.object({
  q: z.string().optional(),
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")
    .optional(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  categoryId: z.string().optional(),
  goalId: z.string().optional(),
  recurringId: z.string().optional(),
  /**
   * Comma-separated category ids for multi-select filter.
   * Combined with `uncategorized` using OR when both are present.
   */
  categoryIds: z.string().optional(),
  /** Pass `"true"` to filter rows with no category. */
  uncategorized: z.enum(["true", "false"]).optional(),
  /** Pass `"true"` to filter rows with no organization. */
  unassignedOrg: z.enum(["true", "false"]).optional(),
  /** Pass `"true"` to filter rows with no goal. */
  unassignedGoal: z.enum(["true", "false"]).optional(),
  /** Pass `"true"` to filter rows with no recurring. */
  unassignedRecurring: z.enum(["true", "false"]).optional(),
  amountSign: financialAmountSignSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
  /**
   * When `"true"`, response includes `total` — full matching row count
   * (ignores cursor / pagination). Used by dashboard review badge.
   */
  includeTotal: z.enum(["true", "false"]).optional(),
});

export const listFinancialTransactionsResponseSchema = z.object({
  transactions: z.array(financialTransactionSchema),
  nextCursor: z.string().nullable(),
  /** Present when the request set `includeTotal=true`. */
  total: z.number().int().nonnegative().optional(),
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

/** Inline image pasted into a task description (blob fetched on demand). */
export const taskImageSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  taskId: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  originalFilename: z.string(),
  checksum: z.string().nullable(),
  /** Relative API path for markdown embeds: `/api/v1/tasks/:id/images/:imageId`. */
  url: z.string(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export const taskImageParamsSchema = z.object({
  id: z.string(),
  imageId: z.string(),
});

/** Build the markdown-safe content path for a task image. */
export function taskImageContentPath(taskId: string, imageId: string): string {
  return `/api/v1/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(imageId)}`;
}

/** Parse a relative or absolute task-image content URL. */
export function parseTaskImageContentPath(
  src: string,
): { taskId: string; imageId: string } | null {
  let path = src.trim();
  if (!path) return null;
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname;
    }
  } catch {
    return null;
  }
  const match = path.match(
    /^\/api\/v1\/tasks\/([^/]+)\/images\/([^/]+)\/?$/,
  );
  if (!match?.[1] || !match[2]) return null;
  return {
    taskId: decodeURIComponent(match[1]),
    imageId: decodeURIComponent(match[2]),
  };
}

export const settingsSchema = z.record(z.unknown());
export const settingsResponseSchema = z.object({ settings: settingsSchema });

export const cursorSettingsSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  spellcheckEnabled: z.boolean(),
  spellcheckModel: z.string(),
  /** Editable agent preamble; empty/null means use the built-in default. */
  spellcheckInstructions: z.string(),
  researchEnabled: z.boolean(),
  researchModel: z.string(),
  /** Editable research preamble; empty/null means use the built-in default. */
  researchInstructions: z.string(),
});

/** Tailscale-reachable PTY sidecar connection for trusted shells (iPad). */
export const agentPtyConnectionSchema = z.object({
  httpOrigin: z.string().url(),
  wsUrl: z.string().url(),
  token: z.string().min(1),
});
export const updateCursorSettingsSchema = z.object({
  /** Set to a new key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
  spellcheckEnabled: z.boolean().optional(),
  spellcheckModel: z.string().min(1).max(128).optional(),
  /** Full instruction text. Empty string resets to the built-in default. */
  spellcheckInstructions: z.string().max(20_000).optional(),
  researchEnabled: z.boolean().optional(),
  researchModel: z.string().min(1).max(128).optional(),
  /** Full instruction text. Empty string resets to the built-in default. */
  researchInstructions: z.string().max(20_000).optional(),
});

/** Moneybird integration (personal API token + administration). */
export const moneybirdSettingsSchema = z.object({
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  administrationId: z.string().nullable(),
  administrationName: z.string().nullable(),
  connected: z.boolean(),
});
export const updateMoneybirdSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  apiToken: z.string().optional(),
  /** Set to an administration id, or null/empty to clear. Omit to leave unchanged. */
  administrationId: z.string().nullable().optional(),
});
export const moneybirdAdministrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().nullable(),
  currency: z.string().nullable(),
});
export const moneybirdAdministrationsResponseSchema = z.object({
  administrations: z.array(moneybirdAdministrationSchema),
});
export const moneybirdTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  administrationName: z.string().nullable(),
  invoiceSampleCount: z.number().int().nullable(),
});

/** AgentMail integration (API key + inbox). */
export const agentMailInboxSchema = z.object({
  inboxId: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  podId: z.string().nullable(),
  contactId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
});
export const agentMailSettingsSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  /** First selected inbox — kept for older clients. */
  inboxId: z.string().nullable(),
  inboxEmail: z.string().nullable(),
  inboxDisplayName: z.string().nullable(),
  inboxIds: z.array(z.string()),
  inboxes: z.array(agentMailInboxSchema),
  organizationId: z.string().nullable(),
  connected: z.boolean(),
  replyGreetingTemplate: z.string(),
  replySignOffTemplateEn: z.string(),
  replySignOffTemplateNl: z.string(),
});
export const updateAgentMailSettingsSchema = z.object({
  /** Set to a new key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
  /** Set to an inbox id, or null/empty to clear. Omit to leave unchanged. */
  inboxId: z.string().nullable().optional(),
  /** Replace the selected inbox list. Empty array clears selection. */
  inboxIds: z.array(z.string()).optional(),
  replyGreetingTemplate: z.string().max(500).optional(),
  replySignOffTemplateEn: z.string().max(500).optional(),
  replySignOffTemplateNl: z.string().max(500).optional(),
  /** Merge inbox id → contact id (null clears). Only selected inboxes are kept. */
  inboxContacts: z
    .record(z.string().min(1), z.string().min(1).nullable())
    .optional(),
});
export const agentMailInboxesResponseSchema = z.object({
  inboxes: z.array(agentMailInboxSchema),
});
export const agentMailTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  organizationId: z.string().nullable(),
  inboxEmail: z.string().nullable(),
  inboxCount: z.number().int().nullable(),
});
export const agentMailListItemKindSchema = z.enum(["message", "draft"]);
export const agentMailConceptDraftSchema = z.object({
  draftId: z.string(),
  inboxId: z.string(),
  subject: z.string().nullable(),
  from: z.string().nullable(),
  to: z.array(z.string()),
  /** Full assembled draft text stored in AgentMail. */
  text: z.string().nullable(),
  /** Editable body without greeting/sign-off. */
  body: z.string().nullable(),
  greeting: z.string().nullable(),
  signOff: z.string().nullable(),
  preview: z.string().nullable(),
  updatedAt: z.string(),
});
export const agentMailMessageSchema = z.object({
  kind: agentMailListItemKindSchema.default("message"),
  inboxId: z.string(),
  threadId: z.string().optional(),
  messageId: z.string(),
  draftId: z.string().nullable().optional(),
  inReplyToMessageId: z.string().nullable().optional(),
  conceptDraftId: z.string().nullable().optional(),
  conceptPreview: z.string().nullable().optional(),
  subject: z.string(),
  from: z.string(),
  preview: z.string().nullable(),
  timestamp: z.string(),
});
export const agentMailMessagesResponseSchema = z.object({
  messages: z.array(agentMailMessageSchema),
});
export const emailThreadMetadataSchema = z.object({
  id: z.string(),
  inboxId: z.string(),
  threadKey: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable().optional(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable().optional(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable().optional(),
  status: taskStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const updateEmailThreadMetadataSchema = z.object({
  organizationId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
});
export const agentMailMessageDetailSchema = agentMailMessageSchema
  .omit({ kind: true, draftId: true, inReplyToMessageId: true })
  .extend({
    kind: agentMailListItemKindSchema.default("message"),
    draftId: z.string().nullable().optional(),
    inReplyToMessageId: z.string().nullable().optional(),
    text: z.string().nullable(),
    html: z.string().nullable(),
    extractedText: z.string().nullable(),
    extractedHtml: z.string().nullable(),
    inboxEmail: z.string().nullable().optional(),
    conceptDraft: agentMailConceptDraftSchema.nullable().optional(),
    threadMetadata: emailThreadMetadataSchema.optional(),
  });
export const agentMailDraftDetailSchema = z.object({
  inboxId: z.string(),
  draftId: z.string(),
  subject: z.string().nullable(),
  preview: z.string().nullable(),
  text: z.string().nullable(),
  body: z.string().nullable().optional(),
  greeting: z.string().nullable().optional(),
  signOff: z.string().nullable().optional(),
  html: z.string().nullable(),
  inReplyTo: z.string().nullable(),
  from: z.string().nullable().optional(),
  to: z.array(z.string()),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export const emailConceptReplyInputSchema = z.object({
  body: z.string().min(1).max(100_000),
});
export const emailConceptReplyResponseSchema = z.object({
  draftId: z.string(),
  inboxId: z.string(),
  inReplyToMessageId: z.string(),
});
export const emailComposeDraftInputSchema = z.object({
  to: z.string().min(1).max(500),
  subject: z.string().max(500),
  body: z.string().min(1).max(100_000),
  composeSessionId: z.string().min(1).max(200).optional(),
});
export const emailComposeDraftResponseSchema = z.object({
  draftId: z.string(),
  inboxId: z.string(),
  composeSessionId: z.string(),
});
export const emailSendDraftResponseSchema = z.object({
  inboxId: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  subject: z.string(),
  inReplyToMessageId: z.string().nullable().optional(),
});
export const emailDeleteDraftResponseSchema = z.object({
  inboxId: z.string(),
  draftId: z.string(),
});
export const updateAgentMailDraftSchema = z.object({
  /** Editable body without greeting/sign-off. */
  body: z.string().max(100_000),
});
export const moneybirdSalesInvoiceSchema = z.object({
  id: z.string(),
  invoiceId: z.string().nullable(),
  state: z.string(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  reference: z.string().nullable(),
  currency: z.string().nullable(),
  totalPriceInclTax: z.string().nullable(),
  totalPriceExclTax: z.string().nullable(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
});
export const moneybirdSalesInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  /** Moneybird filter string, e.g. `state:open|late` or `period:this_year`. */
  filter: z.string().max(500).optional(),
});
export const moneybirdSalesInvoicesResponseSchema = z.object({
  invoices: z.array(moneybirdSalesInvoiceSchema),
  page: z.number().int(),
  perPage: z.number().int(),
  /** True when Moneybird may have another page after this one. */
  hasMore: z.boolean(),
  /**
   * Last Moneybird list page for this filter (discovered via probes;
   * Moneybird does not return totals).
   */
  totalPages: z.number().int().positive(),
});
/** Postal / company address block for invoice recipient or sender identity. */
export const moneybirdInvoicePartySchema = z.object({
  companyName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  address1: z.string().nullable(),
  address2: z.string().nullable(),
  zipcode: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  customerId: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  chamberOfCommerce: z.string().nullable(),
  taxNumber: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
});
export const moneybirdInvoiceLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.string().nullable(),
  price: z.string().nullable(),
  totalPriceExclTax: z.string().nullable(),
  taxRateId: z.string().nullable(),
  /** Percentage string from Moneybird tax rates, e.g. `"21.0"`. */
  taxPercentage: z.string().nullable(),
});
export const moneybirdInvoiceTaxTotalSchema = z.object({
  taxRateId: z.string().nullable(),
  taxableAmount: z.string().nullable(),
  taxAmount: z.string().nullable(),
  taxPercentage: z.string().nullable(),
});
/** Full Moneybird sales invoice for the finance detail panel. */
export const moneybirdSalesInvoiceDetailSchema = z.object({
  id: z.string(),
  invoiceId: z.string().nullable(),
  state: z.string(),
  language: z.string().nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  reference: z.string().nullable(),
  currency: z.string().nullable(),
  pricesAreInclTax: z.boolean(),
  totalPriceInclTax: z.string().nullable(),
  totalPriceExclTax: z.string().nullable(),
  contactId: z.string().nullable(),
  recipient: moneybirdInvoicePartySchema,
  sender: moneybirdInvoicePartySchema.nullable(),
  lines: z.array(moneybirdInvoiceLineSchema),
  taxTotals: z.array(moneybirdInvoiceTaxTotalSchema),
});
export const moneybirdInvoiceRevenueQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100).optional(),
});
/** Monthly billed sales-invoice totals from Moneybird (expense always 0 for now). */
export const moneybirdInvoiceRevenueResponseSchema = z.object({
  year: z.number().int(),
  months: z.array(bankAccountCashflowMonthSchema),
});

export const vaultStorageSettingsSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("local-vault"),
  vaultPath: z.string().nullable(),
});
export const updateVaultStorageSettingsSchema = z.object({
  vaultPath: z.string().min(1).max(4096),
});
/** Response from ensuring a project's on-disk vault folder + `.cursor` skills. */
export const projectVaultEnsureSchema = z.object({
  projectId: z.string(),
  projectKey: z.string(),
  projectVaultPath: z.string(),
  localWorkingDirectory: z.string().nullable(),
  assignedWorkingDirectory: z.boolean(),
  createdSkill: z.boolean(),
  /** False when the vault path is not configured yet. */
  configured: z.boolean(),
});
export const cursorModelSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
});
export const cursorModelsResponseSchema = z.object({
  models: z.array(cursorModelSchema),
});
export const spellcheckRequestSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
});
export const spellcheckResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
});
/** Same request/response shape as spellcheck — title/description rewrite. */
export const researchRequestSchema = spellcheckRequestSchema;
export const researchResponseSchema = spellcheckResponseSchema;

export const createMentionSchema = z.object({
  userId: z.string().nullable().optional(),
  sourceType: z.string().min(1).max(64),
  sourceId: z.string().min(1),
  excerpt: z.string().max(1000).optional(),
});
export const mentionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  sourceType: z.string(),
  sourceId: z.string(),
  excerpt: z.string().nullable(),
  readAt: nullableIsoDateSchema,
  createdAt: isoDateSchema,
});
export const globalSearchResultSchema = z.object({
  type: z.enum(["project", "task", "document", "organization", "contact", "letter"]),
  id: z.string(),
  title: z.string(),
  snippet: z.string().nullable(),
  updatedAt: isoDateSchema,
  /** Present for document results: project | knowledge | journal. */
  documentType: z.enum(["project", "knowledge", "journal"]).nullable().optional(),
  /** Document relative path for href building. */
  path: z.string().nullable().optional(),
  /** Project UUID for project-document href building. */
  projectId: z.string().nullable().optional(),
});

export const projectRelationsSchema = z.object({
  project: projectSchema.extend({ workspaceId: z.string() }),
  organization: organizationSchema.nullable(),
  tasks: z.array(taskSchema.extend({ workspaceId: z.string() })),
  documents: z.array(documentSchema.extend({ workspaceId: z.string() })),
  letters: z.array(letterSchema),
});
export const taskRelationsSchema = z.object({
  task: taskSchema.extend({ workspaceId: z.string() }),
  project: projectSchema.extend({ workspaceId: z.string() }).nullable(),
  contact: contactSchema.nullable(),
  assignee: contactSchema.nullable(),
});
export const organizationRelationsSchema = z.object({
  organization: organizationSchema,
  contacts: z.array(contactSchema),
  projects: z.array(projectSchema.extend({ workspaceId: z.string() })),
  letters: z.array(letterSchema),
});
export const contactRelationsSchema = z.object({
  contact: contactSchema,
  organization: organizationSchema.nullable(),
  tasks: z.array(taskSchema.extend({ workspaceId: z.string() })),
  letters: z.array(letterSchema),
});
export const letterRelationsSchema = z.object({
  letter: letterSchema,
  project: projectSchema.extend({ workspaceId: z.string() }).nullable(),
  organization: organizationSchema.nullable(),
  contact: contactSchema.nullable(),
});

export const opsSyncDeviceSchema = z.object({
  deviceId: z.string(),
  lastSeenAt: z.string(),
  eventCount: z.number().int(),
});
export const opsSyncHealthSchema = z.object({
  workspaceId: z.string(),
  cursor: z.number().int(),
  eventsLastHour: z.number().int(),
  devices: z.array(opsSyncDeviceSchema),
  failedPushes: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      message: z.string(),
    }),
  ),
  spacesConfigured: z.boolean(),
});
export const opsLogEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  detail: z.string().optional(),
});
export const opsLogsSchema = z.object({
  logs: z.array(opsLogEntrySchema),
});

export const recurringTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  projectId: z.string().nullable(),
  inbox: z.boolean(),
  /** 5-field UTC cron: minute hour day-of-month month day-of-week */
  cronExpression: z.string(),
  enabled: z.boolean(),
  nextRunAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable(),
  lastTaskId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createRecurringTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).nullable().optional(),
  projectId: z.string().nullable().optional(),
  inbox: z.boolean().optional(),
  cronExpression: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
});

export const updateRecurringTaskSchema = createRecurringTaskSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
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

export const whoopRecoveryStateSchema = z.enum(["GREEN", "YELLOW", "RED"]);

export const whoopSleepStagesSchema = z.object({
  remMs: z.number().nullable().optional(),
  lightMs: z.number().nullable().optional(),
  swsMs: z.number().nullable().optional(),
  wakeMs: z.number().nullable().optional(),
});

export const whoopStrainTargetSchema = z.object({
  value: z.number().nullable().optional(),
  optimalLower: z.number().nullable().optional(),
  optimalUpper: z.number().nullable().optional(),
});

export const whoopSnapshotSchema = z.object({
  id: z.string(),
  date: z.string().date(),
  recoveryScore: z.number().nullable().optional(),
  recoveryState: whoopRecoveryStateSchema.nullable().optional(),
  hrvMs: z.number().nullable().optional(),
  rhrBpm: z.number().nullable().optional(),
  sleepPerformance: z.number().nullable().optional(),
  sleepDuration: z.string().optional(),
  strainScore: z.number().nullable().optional(),
  workoutsCount: z.number().int().optional(),
  strainTarget: whoopStrainTargetSchema.nullable().optional(),
  sleepStartedAt: z.string().nullable().optional(),
  sleepEndedAt: z.string().nullable().optional(),
  timeInBed: z.string().optional(),
  sleepEfficiencyPct: z.number().nullable().optional(),
  sleepStages: whoopSleepStagesSchema.optional(),
});

export const habitCadenceSchema = z.enum([
  "daily",
  "every_2_days",
  "weekly",
  "monthly",
]);

export const createHabitSchema = z.object({
  title: z.string().min(1).max(500),
  icon: z.string().max(128).nullable().optional(),
  cadence: habitCadenceSchema.optional(),
  /** Defaults to the Health project when omitted. */
  projectId: z.string().min(1).optional(),
});

export const updateHabitSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    icon: z.string().max(128).nullable().optional(),
    description: z.string().max(10000).nullable().optional(),
    cadence: habitCadenceSchema.optional(),
    projectId: z.string().min(1).optional(),
    /**
     * Reschedule the habit's current open day task to this workspace-local YMD
     * (today or future). Also re-anchors the cadence schedule to that day.
     */
    nextDueYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

/** Record (or update) a habit day as completed or skipped. */
export const recordHabitDaySchema = z.object({
  dueYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["completed", "canceled"]),
});

export const habitSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().nullable(),
  /** Optional plain-text notes (same pattern as task.description). */
  description: z.string().nullable(),
  /** Project habit day tasks are filed under. */
  projectId: z.string(),
  cadence: habitCadenceSchema,
  /** Workspace-local YMD the cadence schedule is anchored to. */
  cadenceAnchorYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sortOrder: z.number().int(),
  todayTaskId: z.string().nullable(),
  todayTaskStatus: taskStatusSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export const whoopDayResultSchema = z.object({
  authenticated: z.boolean(),
  snapshot: whoopSnapshotSchema.nullable(),
  error: z.string().nullable().optional(),
});

export const whoopSettingsStatusSchema = z.object({
  connected: z.boolean(),
  configured: z.boolean(),
  email: z.string().nullable(),
  reason: z.string().nullable(),
  envPath: z.string(),
});

export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitCadence = z.infer<typeof habitCadenceSchema>;
export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type RecordHabitDayInput = z.infer<typeof recordHabitDaySchema>;
export type TaskLink = z.infer<typeof taskLinkSchema>;
export type TaskComment = z.infer<typeof taskCommentSchema>;
export type TaskActivity = z.infer<typeof taskActivitySchema>;
export type TaskActivityType = z.infer<typeof taskActivityTypeSchema>;
export type CreateTaskActivityInput = z.infer<typeof createTaskActivitySchema>;
export type AgentWorkedActivityData = z.infer<
  typeof agentWorkedActivityDataSchema
>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type GithubRepository = z.infer<typeof githubRepositorySchema>;
export type GithubBranch = z.infer<typeof githubBranchSchema>;
export type GithubCommit = z.infer<typeof githubCommitSchema>;
export type GithubPullRequest = z.infer<typeof githubPullRequestSchema>;
export type GithubPullRequestFile = z.infer<typeof githubPullRequestFileSchema>;
export type GithubPullRequestFileStatus = z.infer<
  typeof githubPullRequestFileStatusSchema
>;
export type GithubPullRequestState = z.infer<
  typeof githubPullRequestStateSchema
>;
export type GithubOrganization = z.infer<typeof githubOrganizationSchema>;
export type GithubConnectionStatus = z.infer<
  typeof githubConnectionStatusSchema
>;
export type ProjectFsEntry = z.infer<typeof projectFsEntrySchema>;
export type ProjectFsEntryKind = z.infer<typeof projectFsEntryKindSchema>;
export type ProjectFsFile = z.infer<typeof projectFsFileSchema>;
export type ProjectFsWriteFileInput = z.infer<typeof projectFsWriteFileSchema>;
export type ProjectFsCreateEntryInput = z.infer<
  typeof projectFsCreateEntrySchema
>;
export type ProjectFsListEntriesResponse = z.infer<
  typeof projectFsListEntriesResponseSchema
>;
export type ProjectFsCreateEntryResponse = z.infer<
  typeof projectFsCreateEntryResponseSchema
>;
export type ProjectFsDeleteEntryResponse = z.infer<
  typeof projectFsDeleteEntryResponseSchema
>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
export type UpdateTaskCommentInput = z.infer<typeof updateTaskCommentSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
export type Document = z.infer<typeof documentSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type DocumentContent = z.infer<typeof documentContentSchema>;
export type UpdateDocumentContentInput = z.infer<typeof updateDocumentContentSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type Contact = z.infer<typeof contactSchema>;
export type ContactSocialAccount = z.infer<typeof contactSocialAccountSchema>;
export type BankAccount = z.infer<typeof bankAccountSchema>;
export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;
export type BankAccountInstitution = z.infer<typeof bankAccountInstitutionSchema>;
export type BankAccountType = z.infer<typeof bankAccountTypeSchema>;
export type BankAccountBalance = z.infer<typeof bankAccountBalanceSchema>;
export type FinanceAssetsDebtRange = z.infer<typeof financeAssetsDebtRangeSchema>;
export type FinanceAssetsDebt = z.infer<typeof financeAssetsDebtResponseSchema>;
export type BankAccountCashflowMonth = z.infer<
  typeof bankAccountCashflowMonthSchema
>;
export type BankAccountCashflow = z.infer<
  typeof bankAccountCashflowResponseSchema
>;
export type WorkspaceCashflow = z.infer<typeof workspaceCashflowResponseSchema>;
export type FinanceSpendPanel = z.infer<typeof financeSpendPanelResponseSchema>;
export type BankAccountsMonthIncome = z.infer<
  typeof bankAccountsMonthIncomeResponseSchema
>;
export type FinancialCategory = z.infer<typeof financialCategorySchema>;
export type FinancialCategoryInput = z.infer<typeof financialCategoryInputSchema>;
export type FinancialCategoryKind = z.infer<typeof financialCategoryKindSchema>;
export type FinancialCategoryListing = z.infer<
  typeof financialCategoryListingSchema
>;
export type FinancialGoal = z.infer<typeof financialGoalSchema>;
export type FinancialGoalInput = z.infer<typeof financialGoalInputSchema>;
export type FinancialGoalListing = z.infer<typeof financialGoalListingSchema>;
export type FinancialGoalSavingMode = z.infer<
  typeof financialGoalSavingModeSchema
>;
export type FinancialRecurring = z.infer<typeof financialRecurringSchema>;
export type FinancialRecurringInput = z.infer<
  typeof financialRecurringInputSchema
>;
export type FinancialImportDialect = z.infer<typeof financialImportDialectSchema>;
export type FinancialImportBatch = z.infer<typeof financialImportBatchSchema>;
export type FinancialImportResult = z.infer<typeof financialImportResultSchema>;
export type FinancialTransaction = z.infer<typeof financialTransactionSchema>;
export type UpdateFinancialTransactionInput = z.infer<
  typeof updateFinancialTransactionSchema
>;
export type BatchDeleteFinancialTransactionsInput = z.infer<
  typeof batchDeleteFinancialTransactionsSchema
>;
export type BatchDeleteFinancialTransactionsResponse = z.infer<
  typeof batchDeleteFinancialTransactionsResponseSchema
>;
export type FinancialAmountSign = z.infer<typeof financialAmountSignSchema>;
export type Area = z.infer<typeof areaSchema>;
export type AreaParent = z.infer<typeof areaParentSchema>;
export type AreaInput = z.infer<typeof areaInputSchema>;
export type Letter = z.infer<typeof letterSchema>;
export type LetterAttachment = z.infer<typeof letterAttachmentSchema>;
export type Avatar = z.infer<typeof avatarSchema>;
export type TaskImage = z.infer<typeof taskImageSchema>;
export type Mention = z.infer<typeof mentionSchema>;
export type CursorSettings = z.infer<typeof cursorSettingsSchema>;
export type AgentPtyConnection = z.infer<typeof agentPtyConnectionSchema>;
export type UpdateCursorSettingsInput = z.infer<typeof updateCursorSettingsSchema>;
export type MoneybirdSettings = z.infer<typeof moneybirdSettingsSchema>;
export type UpdateMoneybirdSettingsInput = z.infer<
  typeof updateMoneybirdSettingsSchema
>;
export type MoneybirdAdministrationSummary = z.infer<
  typeof moneybirdAdministrationSchema
>;
export type MoneybirdTestConnectionResult = z.infer<
  typeof moneybirdTestConnectionResultSchema
>;
export type AgentMailSettings = z.infer<typeof agentMailSettingsSchema>;
export type UpdateAgentMailSettingsInput = z.infer<
  typeof updateAgentMailSettingsSchema
>;
export type AgentMailInboxSummary = z.infer<typeof agentMailInboxSchema>;
export type AgentMailTestConnectionResult = z.infer<
  typeof agentMailTestConnectionResultSchema
>;
export type AgentMailConceptDraft = z.infer<typeof agentMailConceptDraftSchema>;
export type AgentMailMessage = z.infer<typeof agentMailMessageSchema>;
export type AgentMailMessageDetail = z.infer<
  typeof agentMailMessageDetailSchema
>;
export type AgentMailDraftDetail = z.infer<typeof agentMailDraftDetailSchema>;
export type EmailConceptReplyInput = z.infer<
  typeof emailConceptReplyInputSchema
>;
export type EmailConceptReplyResponse = z.infer<
  typeof emailConceptReplyResponseSchema
>;
export type EmailComposeDraftInput = z.infer<
  typeof emailComposeDraftInputSchema
>;
export type EmailComposeDraftResponse = z.infer<
  typeof emailComposeDraftResponseSchema
>;
export type EmailSendDraftResponse = z.infer<
  typeof emailSendDraftResponseSchema
>;
export type EmailDeleteDraftResponse = z.infer<
  typeof emailDeleteDraftResponseSchema
>;
export type UpdateAgentMailDraftInput = z.infer<
  typeof updateAgentMailDraftSchema
>;
export type EmailThreadMetadata = z.infer<typeof emailThreadMetadataSchema>;
export type UpdateEmailThreadMetadataInput = z.infer<
  typeof updateEmailThreadMetadataSchema
>;
export type MoneybirdSalesInvoiceSummary = z.infer<
  typeof moneybirdSalesInvoiceSchema
>;
export type MoneybirdInvoiceParty = z.infer<typeof moneybirdInvoicePartySchema>;
export type MoneybirdInvoiceLine = z.infer<typeof moneybirdInvoiceLineSchema>;
export type MoneybirdInvoiceTaxTotal = z.infer<
  typeof moneybirdInvoiceTaxTotalSchema
>;
export type MoneybirdSalesInvoiceDetail = z.infer<
  typeof moneybirdSalesInvoiceDetailSchema
>;
export type MoneybirdInvoiceRevenue = z.infer<
  typeof moneybirdInvoiceRevenueResponseSchema
>;
export type VaultStorageSettings = z.infer<typeof vaultStorageSettingsSchema>;
export type ProjectVaultEnsure = z.infer<typeof projectVaultEnsureSchema>;
export type UpdateVaultStorageSettingsInput = z.infer<
  typeof updateVaultStorageSettingsSchema
>;
export type CursorModel = z.infer<typeof cursorModelSchema>;
export type SpellcheckRequest = z.infer<typeof spellcheckRequestSchema>;
export type SpellcheckResponse = z.infer<typeof spellcheckResponseSchema>;
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchResponse = z.infer<typeof researchResponseSchema>;
export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>;
export type PowerSyncCredentials = z.infer<typeof powerSyncCredentialsSchema>;
export type PowerSyncWriteInput = z.infer<typeof powerSyncWriteSchema>;
export type RecurringTask = z.infer<typeof recurringTaskSchema>;
export type CreateRecurringTaskInput = z.infer<typeof createRecurringTaskSchema>;
export type UpdateRecurringTaskInput = z.infer<typeof updateRecurringTaskSchema>;
export type WhoopSnapshot = z.infer<typeof whoopSnapshotSchema>;
export type WhoopDayResult = z.infer<typeof whoopDayResultSchema>;
export type WhoopSettingsStatus = z.infer<typeof whoopSettingsStatusSchema>;
