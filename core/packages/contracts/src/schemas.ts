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
  /** Contacts this task is about / for (not the assignee). */
  relatedContactIds: z.array(z.string()).default([]),
  /** Organizations this task is about / for (same Related UI field as contacts). */
  relatedOrganizationIds: z.array(z.string()).default([]),
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  dueDate: z.string().datetime().nullable(),
  /** End of a timed calendar block; null = all-day due date. */
  dueEndDate: z.string().datetime().nullable().optional(),
  triagedAt: z.string().datetime().nullable(),
  inbox: z.boolean(),
  /**
   * Client support ticket (portal Support / Communication).
   * Email threads use `email_threads`, not this flag.
   */
  support: z.boolean(),
  /**
   * Notification-style task. Same workflow as normal work; UI can present
   * and filter these differently from project/support tasks.
   */
  notification: z.boolean(),
  links: z.array(taskLinkSchema),
  /** Cursor Agent chat id bound to this task, if any. */
  agentChatId: z.string().nullable(),
  /**
   * GitHub commit SHAs for this task’s change records (desktop Diff view).
   * Empty when none are linked.
   */
  linkedCommitShas: z.array(z.string()).default([]),
  /** Habit definition this daily instance belongs to, if any. */
  habitId: z.string().nullable().optional(),
  completedAt: z.string().datetime().nullable(),
  /** Set when created via API key or agent actor. */
  agentCreatedAt: z.string().datetime().nullable().optional(),
  /** User sign-off timestamp; clears Agents inbox subgroup. */
  agentInboxApprovedAt: z.string().datetime().nullable().optional(),
  /** Manual / timer tracked duration (whole minutes; legacy). */
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  /** Manual / timer tracked duration (whole seconds). */
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createTaskSchema = z.object({
  /** Client-generated id for offline-first / PowerSync dual-write creates. */
  id: z.string().min(1).max(64).optional(),
  projectId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  relatedContactIds: z.array(z.string()).optional(),
  relatedOrganizationIds: z.array(z.string()).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  /** End of a timed calendar block; null = all-day due date. */
  dueEndDate: z.string().datetime().nullable().optional(),
  triagedAt: z.string().datetime().nullable().optional(),
  inbox: z.boolean().optional(),
  /** Mark as a client support ticket (defaults false). */
  support: z.boolean().optional(),
  /** Mark as a notification-style task (defaults false). */
  notification: z.boolean().optional(),
  links: z.array(taskLinkSchema).max(20).optional(),
  agentChatId: z.string().max(128).nullable().optional(),
  /** GitHub commit SHAs (7–64 hex chars each); replaces the full list when set. */
  linkedCommitShas: z
    .array(z.string().regex(/^[0-9a-fA-F]{7,64}$/))
    .max(20)
    .optional(),
  habitId: z.string().nullable().optional(),
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  /** Replicated from sync; when set, do not invent from actor/api_key. */
  agentCreatedAt: z.string().datetime().nullable().optional(),
  /** Replicated from sync on create. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
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
    /** Replicated from client sync; prefer {@link agentInboxApproved} on REST. */
    agentInboxApprovedAt: z.string().datetime().nullable().optional(),
    /** Clear the Updated inbox flag after the user views the item. */
    acknowledgeInboxUpdate: z.boolean().optional(),
    inboxUpdatedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).filter(
        (key) =>
          key !== "activityActor" &&
          key !== "agentInboxApproved" &&
          key !== "acknowledgeInboxUpdate",
      ).length > 0 ||
      value.agentInboxApproved === true ||
      value.acknowledgeInboxUpdate === true,
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
  /**
   * Optional contact to attribute as author (API-key callers only, e.g. client portal
   * or BacksterDEV agent contact profile). Takes precedence over `activityActor: "agent"`.
   * Ignored for session/user auth.
   */
  authorContactId: z.string().nullable().optional(),
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
  "related_contacts_changed",
  "related_organizations_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
  "agent_worked",
  "timer_started",
  "timer_stopped",
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

export const timerStartedActivityDataSchema = z.object({}).passthrough();

export const timerStoppedActivityDataSchema = z.object({
  durationSeconds: z.number().int().nonnegative(),
});

export const createTaskActivitySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent_worked"),
    data: agentWorkedActivityDataSchema,
  }),
  z.object({
    type: z.literal("timer_started"),
    data: timerStartedActivityDataSchema.optional().default({}),
  }),
  z.object({
    type: z.literal("timer_stopped"),
    data: timerStoppedActivityDataSchema,
  }),
]);

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

/**
 * Live “agent is working on this task” presence — orthogonal to workflow
 * `status`. Clients heartbeat while a turn is running; rows expire by TTL.
 */
export const taskAgentPresenceSourceSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .default("unknown");

export const upsertTaskAgentPresenceSchema = z.object({
  source: taskAgentPresenceSourceSchema.optional(),
  sessionId: z.string().trim().min(1).max(128).nullable().optional(),
});

export const taskAgentPresenceSchema = z.object({
  taskId: z.string(),
  source: z.string(),
  sessionId: z.string().nullable(),
  startedAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime(),
});

export const listTaskAgentPresenceQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
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
  /** Geocoded coordinates from Mapbox (null until resolved). */
  latitude: z.number().finite().min(-90).max(90).nullable().optional(),
  longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema).max(20).optional(),
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
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  socialAccounts: z.array(contactSocialAccountSchema),
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
  /** Link to a Moneybird financial account for mutation sync. */
  moneybirdFinancialAccountId: z.string().min(1).max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
  /** Avatar blob key — set via avatar PUT / sync, not typical REST create. */
  avatarStorageKey: z.string().nullable().optional(),
  avatarContentType: z.string().nullable().optional(),
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
  moneybirdFinancialAccountId: z.string().nullable(),
  moneybirdLastSyncedAt: nullableIsoDateSchema,
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

/** Cash Flow planning scratchpad row type. */
export const cashflowPlannerEntryTypeSchema = z.enum(["expense", "income"]);

export const cashflowPlannerEntryInputSchema = z.object({
  entryType: cashflowPlannerEntryTypeSchema,
  name: z.string().min(1).max(255),
  /** Absolute amount in cents; sign comes from entryType. */
  amountCents: z.number().int().nonnegative(),
  /** Due / pay date (YYYY-MM-DD). */
  dueDate: calendarDateSchema,
  /** Optional free-text group label (e.g. Housing, Week 1). */
  groupLabel: z.string().max(255).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateCashflowPlannerEntrySchema =
  cashflowPlannerEntryInputSchema.partial();
export const cashflowPlannerEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  entryType: cashflowPlannerEntryTypeSchema,
  name: z.string(),
  amountCents: z.number().int().nonnegative(),
  dueDate: calendarDateSchema,
  groupLabel: z.string().nullable(),
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
  /**
   * Moneybird `settlement_state` (or equivalent). Null for CSV imports /
   * unknown → treat as settled. Void states (refused, cancelled, …) stay in
   * the ledger for classification but must not affect balances or cashflow.
   */
  settlementState: z.string().nullable(),
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

export const taskAttachmentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  taskId: z.string(),
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
export const taskAttachmentParamsSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
});
export const taskAttachmentsResponseSchema = z.object({
  attachments: z.array(taskAttachmentSchema),
});
export const updateTaskAttachmentSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
});
export const reorderTaskAttachmentsSchema = z.object({
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

export const upsertDevicePushTokenSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  token: z.string().min(1),
  deviceName: z.string().max(255).optional(),
});
export const deleteDevicePushTokenSchema = z.object({
  token: z.string().min(1),
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

/** Mapbox integration (access token for geocode + static maps). */
export const mapboxSettingsSchema = z.object({
  accessTokenConfigured: z.boolean(),
  accessTokenPreview: z.string().nullable(),
  connected: z.boolean(),
});
export const updateMapboxSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  accessToken: z.string().optional(),
});
export const mapboxTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});

/** GitHub integration (workspace PAT; optional Clerk OAuth still supported). */
export const githubSettingsSchema = z.object({
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  /** True when a workspace PAT or env fallback is configured. */
  connected: z.boolean(),
  /** Env `GITHUB_API_TOKEN` is set (shown so Settings can explain fallback). */
  envTokenConfigured: z.boolean(),
});
export const updateGithubSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  apiToken: z.string().optional(),
});
export const githubTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  login: z.string().nullable(),
});

/** Shared place/geocode result for contacts (and later meetings). */
export const mapboxGeocodeResultSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  formatted: z.string(),
  relevance: z.number().finite().nullable(),
  placeName: z.string().nullable(),
});
export const mapboxGeocodeQuerySchema = z.object({
  q: z.string().min(1).max(500),
  /** Optional ISO 3166-1 alpha-2 to bias Mapbox results. */
  country: z.string().min(2).max(2).optional(),
});
export const mapboxStaticMapQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  z: z.coerce.number().finite().min(0).max(22).optional(),
  width: z.coerce.number().int().min(1).max(1280).optional(),
  height: z.coerce.number().int().min(1).max(1280).optional(),
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
  replyGreetingTemplateEn: z.string(),
  replyGreetingTemplateNl: z.string(),
  replySignOffTemplateEn: z.string(),
  replySignOffTemplateNl: z.string(),
  webhookConfigured: z.boolean(),
});
export const updateAgentMailSettingsSchema = z.object({
  /** Set to a new key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
  /** Set to an inbox id, or null/empty to clear. Omit to leave unchanged. */
  inboxId: z.string().nullable().optional(),
  /** Replace the selected inbox list. Empty array clears selection. */
  inboxIds: z.array(z.string()).optional(),
  /** @deprecated Prefer replyGreetingTemplateEn. */
  replyGreetingTemplate: z.string().max(500).optional(),
  replyGreetingTemplateEn: z.string().max(500).optional(),
  replyGreetingTemplateNl: z.string().max(500).optional(),
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
  /** Recipients when the list/detail payload includes them (AgentMail). */
  to: z.array(z.string()).optional(),
  preview: z.string().nullable(),
  timestamp: z.string(),
  /** Workspace email thread row id (when registered). */
  emailThreadId: z.string().optional(),
  /** Workspace-wide display number (E-1, E-2, …). */
  number: z.number().int().positive().optional(),
  displayId: z.string().optional(),
  /** Workspace thread property; defaults to backlog when unset. */
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
});
export const agentMailMessagesResponseSchema = z.object({
  messages: z.array(agentMailMessageSchema),
});
export const emailThreadMetadataSchema = z.object({
  id: z.string(),
  inboxId: z.string(),
  threadKey: z.string(),
  number: z.number().int().positive(),
  displayId: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable().optional(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable().optional(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable().optional(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  status: taskStatusSchema,
  priority: z.number().int().min(0).max(4),
  dueDate: z.string().datetime().nullable(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const updateEmailThreadMetadataSchema = z.object({
  organizationId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  /** Clear the Updated inbox flag after the user views the item. */
  acknowledgeInboxUpdate: z.boolean().optional(),
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
});
export const emailThreadCommentAuthorSchema = z.enum(["user", "agent"]);
export const emailThreadCommentSchema = z.object({
  id: z.string(),
  emailThreadId: z.string(),
  body: z.string(),
  author: emailThreadCommentAuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const createEmailThreadCommentSchema = z.object({
  body: z.string().min(1).max(100_000),
  author: emailThreadCommentAuthorSchema.optional(),
});
export const updateEmailThreadCommentSchema = z.object({
  body: z.string().min(1).max(100_000),
});
export const emailThreadCommentsResponseSchema = z.object({
  comments: z.array(emailThreadCommentSchema),
});
export const agentMailMessageAttachmentSchema = z.object({
  attachmentId: z.string(),
  size: z.number().int().nonnegative().optional(),
  filename: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  contentDisposition: z.string().nullable().optional(),
  contentId: z.string().nullable().optional(),
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
    to: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    attachments: z.array(agentMailMessageAttachmentSchema).optional(),
    inboxEmail: z.string().nullable().optional(),
    conceptDraft: agentMailConceptDraftSchema.nullable().optional(),
    threadMetadata: emailThreadMetadataSchema.optional(),
    threadComments: z.array(emailThreadCommentSchema).optional(),
    /** All messages in the AgentMail thread (oldest → newest when present). */
    threadMessages: z
      .array(
        z.object({
          messageId: z.string(),
          threadId: z.string().optional(),
          subject: z.string(),
          from: z.string(),
          to: z.array(z.string()),
          timestamp: z.string(),
          text: z.string().nullable(),
          html: z.string().nullable(),
          extractedText: z.string().nullable(),
          extractedHtml: z.string().nullable(),
          labels: z.array(z.string()).optional(),
          inReplyTo: z.string().nullable().optional(),
          attachments: z.array(agentMailMessageAttachmentSchema).optional(),
        }),
      )
      .optional(),
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
export const emailDeleteMessageResponseSchema = z.object({
  ok: z.literal(true),
});
export const emailReportSpamResponseSchema = z.object({
  ok: z.literal(true),
  blockedSender: z.string().nullable(),
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

/** Active Moneybird financial accounts (bank / card / payment rails). */
export const moneybirdFinancialAccountSchema = z.object({
  id: z.string(),
  type: z.string().nullable(),
  name: z.string(),
  identifier: z.string().nullable(),
  currency: z.string().nullable(),
  provider: z.string().nullable(),
  moneybirdAccount: z.boolean(),
  active: z.boolean(),
});
export const moneybirdFinancialAccountsResponseSchema = z.object({
  financialAccounts: z.array(moneybirdFinancialAccountSchema),
});

/** Result of ingesting Moneybird financial mutations into a bank account. */
export const moneybirdBankAccountSyncResultSchema = z.object({
  bankAccountId: z.string(),
  moneybirdFinancialAccountId: z.string(),
  fetched: z.number().int().nonnegative(),
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  lastSyncedAt: isoDateSchema,
});

export const moneybirdBankAccountSyncQuerySchema = z.object({
  /** Moneybird period filter; defaults to this_year. */
  period: z.string().min(1).max(64).optional(),
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

export const createMeetingSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  summary: z.string().max(100000).nullable().optional(),
  notes: z.string().max(100000).nullable().optional(),
  transcription: z.string().max(100000).nullable().optional(),
  status: taskStatusSchema.optional(),
  projectId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  attendeeContactIds: z.array(z.string()).optional(),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
  location: z.string().max(2000).nullable().optional(),
  locationOrganizationId: z.string().nullable().optional(),
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
});

export const updateMeetingSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    summary: z.string().max(100000).nullable().optional(),
    notes: z.string().max(100000).nullable().optional(),
    transcription: z.string().max(100000).nullable().optional(),
    status: taskStatusSchema.optional(),
    projectId: z.string().nullable().optional(),
    organizationId: z.string().nullable().optional(),
    attendeeContactIds: z.array(z.string()).optional(),
    startAt: isoDateSchema.optional(),
    endAt: isoDateSchema.optional(),
    format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
    location: z.string().max(2000).nullable().optional(),
    locationOrganizationId: z.string().nullable().optional(),
    trackedMinutes: z.number().int().nonnegative().nullable().optional(),
    trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
    /** Clear the Updated inbox flag after the user views the item. */
    acknowledgeInboxUpdate: z.boolean().optional(),
    inboxUpdatedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).filter((key) => key !== "acknowledgeInboxUpdate")
        .length > 0 || value.acknowledgeInboxUpdate === true,
    {
      message: "At least one field is required",
    },
  );

export const meetingSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  transcription: z.string().nullable(),
  status: taskStatusSchema,
  projectId: z.string().nullable(),
  organizationId: z.string().nullable(),
  attendeeContactIds: z.array(z.string()),
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
  location: z.string().nullable().optional(),
  locationOrganizationId: z.string().nullable().optional(),
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export type Meeting = z.infer<typeof meetingSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const meetingWeekdayHoursSlotSchema = z.object({
  start: z.string().min(1).max(8),
  end: z.string().min(1).max(8),
});
export type MeetingWeekdayHoursSlot = z.infer<typeof meetingWeekdayHoursSlotSchema>;

export const meetingWeekdayHoursEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  enabled: z.boolean(),
  slots: z.array(meetingWeekdayHoursSlotSchema).min(1).max(12),
});
export type MeetingWeekdayHoursEntry = z.infer<
  typeof meetingWeekdayHoursEntrySchema
>;

export const meetingSchedulingSettingsSchema = z.object({
  label: z.string(),
  timezone: z.string(),
  weekdayHours: z.array(meetingWeekdayHoursEntrySchema),
  durationsMinutes: z.array(z.union([z.literal(30), z.literal(60)])),
  minNoticeMinutes: z.number().int().nonnegative(),
  bufferMinutes: z.number().int().nonnegative(),
  horizonDays: z.number().int().positive(),
  enabled: z.boolean(),
});
export type MeetingSchedulingSettings = z.infer<
  typeof meetingSchedulingSettingsSchema
>;

export const updateMeetingSchedulingSettingsSchema = z.object({
  label: z.string().max(200).optional(),
  timezone: z.string().min(1).max(128).optional(),
  weekdayHours: z.array(meetingWeekdayHoursEntrySchema).min(1).max(7).optional(),
  durationsMinutes: z.array(z.union([z.literal(30), z.literal(60)])).optional(),
  minNoticeMinutes: z.number().int().nonnegative().optional(),
  bufferMinutes: z.number().int().nonnegative().optional(),
  horizonDays: z.number().int().positive().max(365).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateMeetingSchedulingSettingsInput = z.infer<
  typeof updateMeetingSchedulingSettingsSchema
>;

export const meetingSlotSchema = z.object({
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
});
export type MeetingSlot = z.infer<typeof meetingSlotSchema>;

export const listMeetingSlotsQuerySchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  durationMinutes: z.coerce
    .number()
    .pipe(z.union([z.literal(30), z.literal(60)])),
});

export const createMeetingBookingSchema = z.object({
  startAt: isoDateSchema,
  endAt: isoDateSchema,
  durationMinutes: z.union([z.literal(30), z.literal(60)]),
  bookerEmail: z.string().email().max(320),
  bookerFirstName: z.string().max(120).optional(),
  bookerLastName: z.string().max(120).optional(),
  note: z.string().max(5000).optional(),
  portalUserId: z.string().max(128).optional(),
  format: z.enum(["video_call", "in_person", "phone_call"]).optional(),
});
export type CreateMeetingBookingInput = z.infer<
  typeof createMeetingBookingSchema
>;

export type TaskLink = z.infer<typeof taskLinkSchema>;
export type TaskComment = z.infer<typeof taskCommentSchema>;
export type TaskActivity = z.infer<typeof taskActivitySchema>;
export type TaskAgentPresence = z.infer<typeof taskAgentPresenceSchema>;
export type UpsertTaskAgentPresenceInput = z.infer<
  typeof upsertTaskAgentPresenceSchema
>;
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
export type CashflowPlannerEntryType = z.infer<
  typeof cashflowPlannerEntryTypeSchema
>;
export type CashflowPlannerEntry = z.infer<typeof cashflowPlannerEntrySchema>;
export type CashflowPlannerEntryInput = z.infer<
  typeof cashflowPlannerEntryInputSchema
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
export type TaskAttachment = z.infer<typeof taskAttachmentSchema>;
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
export type MapboxSettings = z.infer<typeof mapboxSettingsSchema>;
export type UpdateMapboxSettingsInput = z.infer<
  typeof updateMapboxSettingsSchema
>;
export type GithubSettings = z.infer<typeof githubSettingsSchema>;
export type UpdateGithubSettingsInput = z.infer<
  typeof updateGithubSettingsSchema
>;
export type GithubTestConnectionResult = z.infer<
  typeof githubTestConnectionResultSchema
>;
export type MapboxTestConnectionResult = z.infer<
  typeof mapboxTestConnectionResultSchema
>;
export type MapboxGeocodeResult = z.infer<typeof mapboxGeocodeResultSchema>;
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
export type AgentMailMessageAttachment = z.infer<
  typeof agentMailMessageAttachmentSchema
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
export type EmailDeleteMessageResponse = z.infer<
  typeof emailDeleteMessageResponseSchema
>;
export type EmailReportSpamResponse = z.infer<
  typeof emailReportSpamResponseSchema
>;
export type UpdateAgentMailDraftInput = z.infer<
  typeof updateAgentMailDraftSchema
>;
export type EmailThreadMetadata = z.infer<typeof emailThreadMetadataSchema>;
export type UpdateEmailThreadMetadataInput = z.infer<
  typeof updateEmailThreadMetadataSchema
>;
export type EmailThreadComment = z.infer<typeof emailThreadCommentSchema>;
export type CreateEmailThreadCommentInput = z.infer<
  typeof createEmailThreadCommentSchema
>;
export type UpdateEmailThreadCommentInput = z.infer<
  typeof updateEmailThreadCommentSchema
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
export type MoneybirdFinancialAccount = z.infer<
  typeof moneybirdFinancialAccountSchema
>;
export type MoneybirdBankAccountSyncResult = z.infer<
  typeof moneybirdBankAccountSyncResultSchema
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
