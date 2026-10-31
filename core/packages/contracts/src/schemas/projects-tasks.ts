import { z } from "zod";

import {
  githubRepositoryNameSchema,
  isoDateSchema,
  nullableIsoDateSchema,
  projectEmailCategorySchema,
  projectProviderSchema,
  projectStatusSchema,
  projectTypeSchema,
  taskStatusSchema,
} from "./common.js";
import {
  nullableProjectChannelSchema,
  nullableProjectDevelopmentSchema,
  nullableProjectProductionSchema,
  projectChannelStatusSchema,
} from "./project-locations.js";
export {
  PROJECT_DEVELOPMENT_KINDS,
  projectDevelopmentKindSchema,
  projectDevelopmentSchema,
  projectProductionSchema,
  nullableProjectDevelopmentSchema,
  nullableProjectProductionSchema,
  PROJECT_CHANNEL_SCHEMES,
  projectChannelSchemeSchema,
  projectChannelUriSchema,
  projectChannelSchema,
  nullableProjectChannelSchema,
  nullableProjectChannelUriSchema,
  PROJECT_CHANNEL_STATUSES,
  projectChannelStatusSchema,
  projectChannelPendingLinkSchema,
  normalizeProjectChannelUri,
  normalizeProjectChannel,
  assertProjectChannelUri,
  assertProjectChannel,
  projectChannelScheme,
  projectChannelSchemeFromUri,
  projectChannelDisplayName,
  isGrokBotChannelUri,
  grokBotAgentIdFromChannel,
  normalizeProjectDevelopment,
  normalizeProjectProduction,
  mirrorProjectLocationCompat,
  developmentFromLegacyLocations,
  productionFromLegacyLocations,
  type ProjectDevelopmentKind,
  type ProjectDevelopment,
  type ProjectProduction,
  type ProjectChannelScheme,
  type ProjectChannel,
  type ProjectChannelStatus,
} from "./project-locations.js";
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
  /** Registrar/hosting provider for Domains (e.g. TransIP). */
  provider: projectProviderSchema.nullable(),
  /** Email provider category when `type = email`. */
  category: projectEmailCategorySchema.nullable(),
  githubRepository: githubRepositoryNameSchema.nullable(),
  /** Cloudflare zone id for Domains DNS management. */
  cloudflareZoneId: z.string().max(64).nullable(),
  /**
   * Linked Penpot (BacksterDESIGN) project UUID.
   * Null until staff create-or-open from the design dashboard.
   */
  penpotProjectId: z.string().uuid().nullable(),
  /**
   * Absolute local folder for agent/PTY and `executionLocation = local`
   * (machine-specific). For codebase projects, defaults to `{vault}/Codebase`.
   * Mirrored from {@link development} when `development.kind = local`.
   */
  localWorkingDirectory: z.string().max(4096).nullable(),
  /**
   * @deprecated Prefer {@link development}.path. Kept as a mirror for OS-106
   * resolvers and older clients.
   */
  developmentLocation: z.string().max(4096).nullable(),
  /**
   * @deprecated Prefer {@link production}.path. Kept as a mirror for OS-106
   * resolvers and older clients.
   */
  productionLocation: z.string().max(4096).nullable(),
  /**
   * Codebase Development location (`local` Mac folder or `server` host+path).
   * Folds the former Local chip into Development.
   */
  development: nullableProjectDevelopmentSchema,
  /**
   * Codebase Production deploy target (server, URL, method, branch, path).
   */
  production: nullableProjectProductionSchema,
  /**
   * Project chat-room Channel `{ uri, name? }`
   * (e.g. uri `grokbot://app/v1/agent?id=<uuid>`). Null when unset.
   */
  channel: nullableProjectChannelSchema,
  /**
   * Self-service Channel connect lifecycle.
   * `inactive` | `connecting` | `needs_details` | `active`.
   */
  channelStatus: projectChannelStatusSchema,
  /**
   * Chat deep link while `needs_details`
   * (`backsteros://chat/<threadId>?message=<id>` or `/chat/…`).
   */
  channelPendingLink: z.string().max(2048).nullable(),
  /** When Connect was requested (connecting / needs_details). */
  channelRequestedAt: z.string().datetime().nullable(),
  /**
   * @deprecated Folded into {@link localWorkingDirectory}. Still accepted on
   * write (mapped then cleared); always null on read after ensure/update.
   */
  localLocation: z.string().max(4096).nullable(),
  /**
   * Legacy development checkout status. Core no longer clones on location set;
   * fields remain for sync/API compat and may still be cleared by clients.
   */
  developmentSetupStatus: z.enum(["pending", "ready", "failed"]).nullable(),
  /** Legacy sanitized setup error (no secrets). */
  developmentSetupError: z.string().max(2000).nullable(),
  developmentSetupUpdatedAt: z.string().datetime().nullable(),
  /**
   * Status probe mode for codebase projects.
   * `simple` = HTTPS ping of `healthCheckDomain`; `advanced` = `/healthz` later.
   */
  healthCheckMode: z.enum(["simple", "advanced"]).nullable(),
  /** Hostname for simple health checks (no scheme/path), e.g. `quarrymill.com`. */
  healthCheckDomain: z.string().max(253).nullable(),
  /** Billable hourly rate in euro cents. Null means unset. */
  hourlyRateCents: z.number().int().nonnegative().nullable(),
  /**
   * Budget rows (`{ period, amountCents }[]`) — period is monthly / weekly /
   * quarterly. Empty when unset.
   */
  budgets: z
    .array(
      z.object({
        period: z.enum(["monthly", "weekly", "quarterly"]),
        amountCents: z.number().int().positive(),
      }),
    )
    .max(20),
  status: projectStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

/** Where a codebase task should run agents (OS-106). */
export const EXECUTION_LOCATIONS = [
  "development",
  "production",
  "local",
] as const;

export const executionLocationSchema = z.enum(EXECUTION_LOCATIONS);

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
  provider: projectProviderSchema.nullable().optional(),
  category: projectEmailCategorySchema.nullable().optional(),
  githubRepository: githubRepositoryNameSchema.nullable().optional(),
  cloudflareZoneId: z.string().max(64).nullable().optional(),
  penpotProjectId: z.string().uuid().nullable().optional(),
  localWorkingDirectory: z.string().max(4096).nullable().optional(),
  developmentLocation: z.string().max(4096).nullable().optional(),
  productionLocation: z.string().max(4096).nullable().optional(),
  development: nullableProjectDevelopmentSchema.optional(),
  production: nullableProjectProductionSchema.optional(),
  /** Project chat-room Channel `{ uri, name? }`. */
  channel: nullableProjectChannelSchema.optional(),
  /** Self-service Channel connect lifecycle (agents may set needs_details/active/inactive). */
  channelStatus: projectChannelStatusSchema.optional(),
  /** Chat deep link while `needs_details`. */
  channelPendingLink: z.string().max(2048).nullable().optional(),
  /** When Connect was requested. */
  channelRequestedAt: z.string().datetime().nullable().optional(),
  /** @deprecated Folded into localWorkingDirectory on write. */
  localLocation: z.string().max(4096).nullable().optional(),
  /** Legacy; core no longer writes these on location set. */
  developmentSetupStatus: z.enum(["pending", "ready", "failed"]).nullable().optional(),
  developmentSetupError: z.string().max(2000).nullable().optional(),
  developmentSetupUpdatedAt: z.string().datetime().nullable().optional(),
  healthCheckMode: z.enum(["simple", "advanced"]).nullable().optional(),
  healthCheckDomain: z.string().max(253).nullable().optional(),
  hourlyRateCents: z.number().int().nonnegative().nullable().optional(),
  budgets: z
    .array(
      z.object({
        period: z.enum(["monthly", "weekly", "quarterly"]),
        amountCents: z.number().int().positive(),
      }),
    )
    .max(20)
    .optional(),
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

/** Target filesystem for project Dev/Local/Prod location picker (OS-111). */
export const locationFsTargetSchema = z.enum([
  "local",
  "development",
  "production",
]);

export const locationFsEntrySchema = z.object({
  name: z.string(),
  /** Absolute POSIX path. */
  path: z.string(),
  kind: z.literal("directory"),
});

export const locationFsListQuerySchema = z
  .object({
    target: locationFsTargetSchema,
    /** Absolute path under the target base; omit for the default (Local → …/Codebase). */
    path: z.string().max(4096).optional(),
    /**
     * Required when `target=local`: jail is `Projects/{project key}` under the
     * vault (not the whole Projects tree).
     */
    projectId: z.string().min(1).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.target === "local" && !value.projectId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required for local location browsing",
        path: ["projectId"],
      });
    }
  });

export const locationFsListResponseSchema = z.object({
  target: locationFsTargetSchema,
  base: z.string(),
  path: z.string(),
  exists: z.boolean(),
  writable: z.boolean(),
  entries: z.array(locationFsEntrySchema),
});

export const locationFsCreateFolderSchema = z
  .object({
    target: locationFsTargetSchema,
    parent: z.string().min(1).max(4096),
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
        "Invalid folder name",
      ),
    /** Required when `target=local` (same jail as list). */
    projectId: z.string().min(1).max(128).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.target === "local" && !value.projectId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required for local location folders",
        path: ["projectId"],
      });
    }
  });

export const locationFsCreateFolderResponseSchema = z.object({
  target: locationFsTargetSchema,
  path: z.string(),
});

export const projectRepoDocEntrySchema = z.object({
  name: z.string(),
  /** Relative path from the working directory (`docs/…` or root `AGENTS.md`). */
  path: z.string(),
  kind: projectFsEntryKindSchema,
  /** Root `AGENTS.md` is pinned even though it sits outside `docs/`. */
  pinned: z.boolean(),
});

export const projectRepoDocsResponseSchema = z.object({
  /** True when `{localWorkingDirectory}/docs` exists as a directory. */
  docsPresent: z.boolean(),
  entries: z.array(projectRepoDocEntrySchema),
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

export const linkedCommitShaSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{7,64}$/);

/** Optional comment created in the same write as POST/PATCH /tasks (OS-64). */
export const taskInlineCommentSchema = z.object({
  body: z.string().min(1).max(20_000),
});

/** Max images accepted in one JSON create/update/comment request (OS-90). */
export const MAX_TASK_IMAGES_PER_REQUEST = 5;

/**
 * Base64 image payload for agent/API uploads (OS-90).
 * `data` may be raw base64 or a `data:<mime>;base64,…` URL.
 */
export const taskImageUploadInputSchema = z.object({
  data: z.string().min(1),
  contentType: z.string().max(128).optional(),
  filename: z.string().max(255).optional(),
  alt: z.string().max(200).optional(),
});

export const taskImagesUploadFieldSchema = z
  .array(taskImageUploadInputSchema)
  .max(MAX_TASK_IMAGES_PER_REQUEST);

/** Inline image pasted into a task description or comment (blob fetched on demand). */
export const taskImageSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  taskId: z.string(),
  /** Set when the image was uploaded for a comment (OS-90). */
  commentId: z.string().nullable().optional(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  originalFilename: z.string(),
  checksum: z.string().nullable(),
  /** Relative API path for markdown embeds: `/api/v1/tasks/:id/images/:imageId`. */
  url: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const taskImageParamsSchema = z.object({
  id: z.string(),
  imageId: z.string(),
});

export const taskImagesResponseSchema = z.object({
  images: z.array(taskImageSchema),
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

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  contactId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  /** Contacts this task is about / for (not the assignee). */
  relatedContactIds: z.array(z.string()).default([]),
  /** Organizations this task is about / for (same Related UI field as contacts). */
  relatedOrganizationIds: z.array(z.string()).default([]),
  /**
   * Related email thread ids (`email_threads.id`). Writes also accept display
   * ids (`E-17`). Unknown/removed threads are kept and do not 500.
   */
  linkedEmailIds: z.array(z.string()).default([]),
  /** Workspace label ids. Managed in Settings; not created from the task dropdown. */
  labelIds: z.array(z.string()).default([]),
  number: z.number().int().positive(),
  /**
   * Human display key, e.g. PF-41 (INBOX-3 without a project). Set by the
   * REST API on single-task, create/update and legacy list responses (OS-45).
   */
  key: z.string().optional(),
  /** Project key (e.g. `OS`); null for inbox tasks. Set on REST task rows (OS-64). */
  projectKey: z.string().nullable().optional(),
  /** Assignee display name when assigneeId is set (OS-64). */
  assigneeName: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  dueDate: z.string().datetime().nullable(),
  /** End of a timed calendar block; null = all-day due date. */
  dueEndDate: z.string().datetime().nullable().optional(),
  /**
   * When to chase an external blocker (`waiting` status). Same shape as
   * {@link dueDate}. Required when status is `waiting`.
   */
  followUpDate: z.string().datetime().nullable().optional(),
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
  /**
   * Linked BacksterDESIGN (Penpot) file / page / board (docs/19 §7).
   * Optional; derived from design URLs in `links` when pasted.
   */
  penpotFileId: z.string().uuid().nullable().optional(),
  penpotPageId: z.string().uuid().nullable().optional(),
  penpotObjectId: z.string().uuid().nullable().optional(),
  /** Cursor Agent chat id bound to this task, if any. */
  agentChatId: z.string().nullable(),
  /**
   * Override of the project's default execution location (OS-106).
   * Frozen once the coding thread starts ({@link executionLocationLockedAt}).
   */
  executionLocation: executionLocationSchema.nullable().optional(),
  /** When the execution location was frozen (ISO). Null while still editable. */
  executionLocationLockedAt: z.string().datetime().nullable().optional(),
  /**
   * Agents-API working marker (OS-96). Contact id of the agent persona currently
   * working this task. Orthogonal to {@link agentChatId} (coding session).
   */
  agentWorkingContactId: z.string().nullable().optional(),
  /** When the agent working marker was set (ISO). Null when cleared. */
  agentWorkingStartedAt: z.string().datetime().nullable().optional(),
  /** Optional chat link / label for the working marker. */
  agentWorkingLabel: z.string().nullable().optional(),
  /** `working` (default) or `reviewing` while the task is in review (OS-96). */
  agentWorkingKind: z.enum(["working", "reviewing"]).nullable().optional(),
  /** Display name for {@link agentWorkingContactId} when set (OS-96). */
  agentWorkingContactName: z.string().nullable().optional(),
  /**
   * GitHub commit SHAs for this task’s change records (desktop Diff view).
   * Empty when none are linked.
   */
  linkedCommitShas: z.array(z.string()).default([]),
  /**
   * When true, an `in_review` transition enqueues Sander's auto-review webhook
   * (OS-92). Default false.
   */
  automateCompletion: z.boolean().default(false),
  /** Latest auto-review delivery for this task (`pending` | `delivered` | `failed`). */
  autoReviewDeliveryStatus: z
    .enum(["pending", "delivered", "failed"])
    .nullable()
    .optional(),
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

/**
 * Compact task row for paginated GET /tasks (OS-28).
 * Enough for an agent to decide relevance without a second fetch.
 */
export const taskListItemSchema = z.object({
  id: z.string(),
  /** Human key, e.g. OS-28 or INBOX-3. */
  key: z.string(),
  title: z.string(),
  status: taskStatusSchema,
  /** 0 = none, 1 = urgent … 4 = low (same scale as Task.priority). */
  priority: z.number().int().min(0).max(4),
  assigneeId: z.string().nullable(),
  /** Assignee display name when assigneeId is set (OS-64). */
  assigneeName: z.string().nullable().optional(),
  projectId: z.string().nullable(),
  /** Project key (e.g. `OS`); null for inbox tasks (OS-64). */
  projectKey: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable(),
  /** Chase date while status is `waiting` (same shape as dueDate). */
  followUpDate: z.string().datetime().nullable().optional(),
  linkedDocumentIds: z.array(z.string()),
  linkedContactIds: z.array(z.string()),
  linkedTaskIds: z.array(z.string()),
  linkedEmailIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Only with `updatedSince`: set when the task was deleted. */
  deletedAt: z.string().datetime().nullable().optional(),
  /** When true, in_review enqueues Sander's auto-review webhook (OS-92). */
  automateCompletion: z.boolean().optional(),
  /** Agents-API working marker contact id (OS-96). */
  agentWorkingContactId: z.string().nullable().optional(),
  agentWorkingStartedAt: z.string().datetime().nullable().optional(),
  agentWorkingLabel: z.string().nullable().optional(),
  agentWorkingKind: z.enum(["working", "reviewing"]).nullable().optional(),
  agentWorkingContactName: z.string().nullable().optional(),
});

/**
 * Query for GET /tasks. Without `paginated=true` (or a `cursor`) the response
 * is the legacy `{ tasks }` shape and paginated-only params (limit, sort,
 * dueDate, linked*, updatedSince, includeTotalCount) are ignored (OS-45).
 * With `paginated=true` the response is `{ items, nextCursor }`.
 */
export const listTasksQuerySchema = z.object({
  /** Project id or key (e.g. `OS`). Unknown values → 400 in paginated mode. */
  projectId: z.string().optional(),
  /** Explicit project key alias (same resolution as projectId). */
  projectKey: z.string().optional(),
  /** Contact id or key. Unknown → 400 when paginated. */
  contactId: z.string().optional(),
  /** Assignee contact id or key. Unknown → 400 when paginated. */
  assigneeId: z.string().optional(),
  /** Related contact id or key. Unknown → 400 when paginated. */
  relatedContactId: z.string().optional(),
  /** Related organization id or key. Unknown → 400 when paginated. */
  relatedOrganizationId: z.string().optional(),
  /**
   * Comma-separated statuses, or `all` for every known status (OS-57).
   * Paginated mode without `status` (and without `updatedSince`) excludes
   * completed/canceled/duplicated by default — see `appliedDefaults`.
   */
  status: z.string().optional(),
  inbox: z.coerce.boolean().optional(),
  support: z.coerce.boolean().optional(),
  notification: z.coerce.boolean().optional(),
  /**
   * Range: `before:<date>`, `after:<date>`, or `between:<start>,<end>`
   * (ISO datetime or YYYY-MM-DD). Opt-in to paginated response.
   */
  dueDate: z.string().optional(),
  /**
   * Same range syntax as {@link dueDate}, applied to `followUpDate`.
   * Useful with `status=waiting` to find chase-due tasks
   * (e.g. `followUpDate=before:2026-10-23`).
   */
  followUpDate: z.string().optional(),
  /** Document id or comma-separated list (bidirectional via front-matter linkedTasks). */
  linkedDocuments: z.string().optional(),
  /** Task id or key (OS-28) or a comma list — co-linked tasks via shared documents. */
  linkedTasks: z.string().optional(),
  /** Email thread id or display id (`E-17`), or a comma list. */
  linkedEmails: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  /** Only `dueDate` is supported today (default). */
  sort: z.literal("dueDate").optional(),
  /** When true, response includes `totalCount` (and `excludedCount` when defaults apply). */
  includeTotalCount: z.coerce.boolean().optional(),
  /** Opt in to paginated `{ items, nextCursor }` (the only switch besides cursor). */
  paginated: z.coerce.boolean().optional(),
  /**
   * Change feed (paginated only): tasks with updatedAt >= this ISO instant,
   * including soft-deleted ones (`deletedAt` set) and, unless `status` is
   * given, all statuses.
   */
  updatedSince: z.string().optional(),
});

export const listTasksLegacyResponseSchema = z.object({
  tasks: z.array(taskSchema),
});

export const listTasksPaginatedResponseSchema = z.object({
  items: z.array(taskListItemSchema),
  nextCursor: z.string().nullable(),
  totalCount: z.number().int().nonnegative().optional(),
  /**
   * With `includeTotalCount` when the default status exclusion applied:
   * how many matching tasks were hidden (completed/canceled/duplicated).
   */
  excludedCount: z.number().int().nonnegative().optional(),
  /**
   * Present when paginated list hid terminal statuses by default (OS-57).
   * Absent when `status` or `updatedSince` was given.
   */
  appliedDefaults: z
    .object({
      excludedStatuses: z.array(z.string()).min(1),
    })
    .optional(),
});

export const listTasksResponseSchema = z.union([
  listTasksLegacyResponseSchema,
  listTasksPaginatedResponseSchema,
]);

const createTaskFieldsSchema = z.object({
  /** Client-generated id for offline-first / PowerSync dual-write creates. */
  id: z.string().min(1).max(64).optional(),
  /** Project id or key. Prefer {@link projectKey} when you only know the key. */
  projectId: z.string().nullable().optional(),
  /** Project key alias (e.g. `OS`); resolved server-side (OS-64). */
  projectKey: z.string().min(1).max(64).optional(),
  /** Contact id or key. */
  contactId: z.string().nullable().optional(),
  /** Assignee contact id or key. */
  assigneeId: z.string().nullable().optional(),
  /** Related contact ids or keys. */
  relatedContactIds: z.array(z.string()).optional(),
  /** Related organization ids or keys. */
  relatedOrganizationIds: z.array(z.string()).optional(),
  /** Related email thread ids or display ids (`E-17`). Unknown ids are kept. */
  linkedEmailIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string().min(1).max(64)).max(32).optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  /** End of a timed calendar block; null = all-day due date. */
  dueEndDate: z.string().datetime().nullable().optional(),
  /**
   * Chase date for external blockers. Required when status is `waiting`
   * (create, or update that moves into / stays in waiting without an
   * existing follow-up). Prefer a comment naming who/what you wait on.
   */
  followUpDate: z.string().datetime().nullable().optional(),
  triagedAt: z.string().datetime().nullable().optional(),
  inbox: z.boolean().optional(),
  /** Mark as a client support ticket (defaults false). */
  support: z.boolean().optional(),
  /** Mark as a notification-style task (defaults false). */
  notification: z.boolean().optional(),
  links: z.array(taskLinkSchema).max(20).optional(),
  penpotFileId: z.string().uuid().nullable().optional(),
  penpotPageId: z.string().uuid().nullable().optional(),
  penpotObjectId: z.string().uuid().nullable().optional(),
  agentChatId: z.string().max(128).nullable().optional(),
  /**
   * Override the project's default execution location at create time (OS-106).
   * Once the coding thread starts it is frozen and further changes are rejected.
   */
  executionLocation: executionLocationSchema.nullable().optional(),
  /**
   * Freeze the execution location (set by BacksterDEV / control API when the
   * thread starts). Cannot unlock once set.
   */
  lockExecutionLocation: z.boolean().optional(),
  /**
   * Mark / clear agents-API working (OS-96). Pass a contact id to claim, or
   * `null` to clear. Server sets `agentWorkingStartedAt`. Agent API keys may
   * only set their own contact (unless owner).
   */
  agentWorkingContactId: z.string().min(1).max(64).nullable().optional(),
  /** Optional chat link / label with the working marker (cleared when marker clears). */
  agentWorkingLabel: z.string().max(256).nullable().optional(),
  /**
   * Marker kind (OS-96): `working` (default) or `reviewing`. Reviewing markers
   * may be set while status is `in_review` and persist until the task leaves
   * that status (or the agent clears the marker).
   */
  agentWorkingKind: z.enum(["working", "reviewing"]).nullable().optional(),
  /** GitHub commit SHAs (7–64 hex chars each); replaces the full list when set. */
  linkedCommitShas: z.array(linkedCommitShaSchema).max(20).optional(),
  /** Enqueue auto-review when this task later moves to in_review (OS-92). */
  automateCompletion: z.boolean().optional(),
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
  /**
   * Create a comment in the same transaction (OS-64). Returned on the task as
   * `comment`.
   */
  comment: taskInlineCommentSchema.optional(),
  /**
   * Upload images and append `![alt](url)` to the description (OS-90).
   * Same storage as `POST /tasks/:id/images`.
   */
  images: taskImagesUploadFieldSchema.optional(),
});

export const createTaskSchema = createTaskFieldsSchema.refine(
  (value) =>
    value.status !== "waiting" ||
    (typeof value.followUpDate === "string" && value.followUpDate.length > 0),
  {
    message: "followUpDate is required when status is waiting",
    path: ["followUpDate"],
  },
);

export const updateTaskSchema = createTaskFieldsSchema
  .partial()
  .extend({
    /** Clerk-only sign-off — removes task from Agents inbox subgroup. */
    agentInboxApproved: z.boolean().optional(),
    /** Replicated from client sync; prefer {@link agentInboxApproved} on REST. */
    agentInboxApprovedAt: z.string().datetime().nullable().optional(),
    /** Clear the Updated inbox flag after the user views the item. */
    acknowledgeInboxUpdate: z.boolean().optional(),
    inboxUpdatedAt: z.string().datetime().nullable().optional(),
    /**
     * Append commit SHAs (deduped, case-insensitive). Prefer this over replacing
     * `linkedCommitShas` so concurrent agents do not overwrite each other (OS-64).
     */
    addLinkedCommitShas: z.array(linkedCommitShaSchema).max(20).optional(),
    /** Remove commit SHAs (case-insensitive match) (OS-64). */
    removeLinkedCommitShas: z.array(linkedCommitShaSchema).max(20).optional(),
    /** Replicated auto-review delivery state (OS-92). */
    autoReviewDeliveryStatus: z
      .enum(["pending", "delivered", "failed"])
      .nullable()
      .optional(),
    /** Replicated freeze timestamp for execution location (OS-106). */
    executionLocationLockedAt: z.string().datetime().nullable().optional(),
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

/**
 * Whether a waiting task still has a chase date after applying a patch.
 * Used by the API when status stays `waiting` and followUpDate is cleared.
 */
export function taskPatchKeepsWaitingFollowUp(input: {
  currentStatus: string;
  currentFollowUpDate: string | null | undefined;
  nextStatus?: string | null;
  nextFollowUpDate?: string | null;
}): boolean {
  const nextStatus = input.nextStatus ?? input.currentStatus;
  if (nextStatus !== "waiting") return true;
  if (input.nextFollowUpDate !== undefined) {
    return (
      typeof input.nextFollowUpDate === "string" &&
      input.nextFollowUpDate.length > 0
    );
  }
  return (
    typeof input.currentFollowUpDate === "string" &&
    input.currentFollowUpDate.length > 0
  );
}

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
  /** Images linked to this comment (OS-90). */
  images: z.array(taskImageSchema).optional(),
});

/**
 * REST task shape including optional inline comment fields (OS-64).
 * `comment` = created in the same POST/PATCH; `comments` = GET ?include=comments.
 * `images` = task description images (OS-90).
 */
export const taskApiSchema = taskSchema.extend({
  comment: taskCommentSchema.optional(),
  comments: z.array(taskCommentSchema).optional(),
  images: z.array(taskImageSchema).optional(),
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
  /**
   * Upload images and append `![alt](url)` to the comment body (OS-90).
   */
  images: taskImagesUploadFieldSchema.optional(),
});

export const updateTaskCommentSchema = z
  .object({
    body: z.string().min(1).max(20_000).optional(),
    /** Pass an ISO timestamp to resolve, or null to unresolve. Only for root comments. */
    resolvedAt: z.string().datetime().nullable().optional(),
    /**
     * Upload images and append `![alt](url)` to the comment body (OS-90).
     */
    images: taskImagesUploadFieldSchema.optional(),
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
  "automate_completion_changed",
  "auto_review_requested",
  /** Discussion body — first-class in the unified activities stream. */
  "comment",
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

/** Reassign the contact on a timer session (start + stop pair). */
export const updateTaskTimerSessionActorSchema = z.object({
  actorContactId: z.string().min(1),
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
  /** Set when type = comment. */
  body: z.string().nullable().optional(),
  /** Comment reply parent when type = comment. */
  parentId: z.string().nullable().optional(),
  /** Root comment resolve timestamp when type = comment. */
  resolvedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullable().optional(),
  /** Present when listing by project (joined from tasks). */
  projectId: z.string().nullable().optional(),
  /** Present on project-scoped lists (joined from tasks). */
  taskNumber: z.number().int().nullable().optional(),
  taskTitle: z.string().nullable().optional(),
});

/**
 * Unified workspace activity feed — one collectable stream, dialed by filters.
 * Prefer this over per-task /activities and /comments for new clients.
 */
export const listActivitiesQuerySchema = z
  .object({
    /** Activities for a single task (comments + system events). */
    taskId: z.string().min(1).optional(),
    /** All task activities under a project (joined via tasks.project_id). */
    projectId: z.string().min(1).optional(),
    /**
     * Comma-separated activity types to include.
     * Omit for all types. Example: `comment,status_changed`.
     */
    types: z.string().optional(),
    /**
     * When true, include soft-deleted comment rows (default false).
     * System event rows are never soft-deleted today.
     */
    includeDeleted: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((value) => value === true || value === "true"),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    /** Opaque cursor from a previous page (`createdAt|id`). */
    cursor: z.string().optional(),
  })
  .refine((value) => Boolean(value.taskId) || Boolean(value.projectId), {
    message: "taskId or projectId is required",
  });

export const listActivitiesResponseSchema = z.object({
  activities: z.array(taskActivitySchema),
  nextCursor: z.string().nullable(),
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

export const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1).max(500),
});

export const moveTaskSchema = z.object({ projectId: z.string().nullable() });

export const triageTaskSchema = z.object({
  projectId: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
});

export const batchUpdateTasksSchema = z.object({
  /** Task ids or display keys (e.g. `OS-51`). */
  ids: z.array(z.string()).min(1).max(500),
  patch: updateTaskSchema,
});

export const batchUpdateTasksResultItemSchema = z.union([
  z.object({
    ok: z.literal(true),
    /** Resolved task id. */
    id: z.string(),
    /** Original ref from the request (id or key). */
    ref: z.string(),
    task: taskSchema,
  }),
  z.object({
    ok: z.literal(false),
    id: z.string().nullable(),
    ref: z.string(),
    error: z.string(),
    code: z.literal("not_found"),
  }),
]);

export const batchUpdateTasksResponseSchema = z.object({
  /** Successfully updated tasks (backward compatible). */
  tasks: z.array(taskSchema),
  /** Per-ref results including 404 entries for unknown ids/keys (OS-64). */
  results: z.array(batchUpdateTasksResultItemSchema),
});

/** Project Updates tab — changelog / incident / maintenance posts. */
export const PROJECT_UPDATE_KINDS = [
  "update",
  "incident",
  "maintenance",
] as const;

export const projectUpdateKindSchema = z.enum(PROJECT_UPDATE_KINDS);

export type ProjectUpdateKind = z.infer<typeof projectUpdateKindSchema>;

/** Visibility for update / maintenance posts. */
export const PROJECT_UPDATE_VISIBILITY_STATUSES = [
  "internal",
  "published",
] as const;

/** Lifecycle for incident posts. */
export const PROJECT_UPDATE_INCIDENT_STATUSES = ["open", "resolved"] as const;

export const PROJECT_UPDATE_STATUSES = [
  ...PROJECT_UPDATE_VISIBILITY_STATUSES,
  ...PROJECT_UPDATE_INCIDENT_STATUSES,
] as const;

export const projectUpdateStatusSchema = z.enum(PROJECT_UPDATE_STATUSES);

export type ProjectUpdateStatus = z.infer<typeof projectUpdateStatusSchema>;

export type ProjectUpdateVisibilityStatus =
  (typeof PROJECT_UPDATE_VISIBILITY_STATUSES)[number];

export type ProjectUpdateIncidentStatus =
  (typeof PROJECT_UPDATE_INCIDENT_STATUSES)[number];

export const PROJECT_UPDATE_DEFAULT_STATUS: ProjectUpdateStatus = "internal";

export const PROJECT_UPDATE_DEFAULT_INCIDENT_STATUS: ProjectUpdateIncidentStatus =
  "open";

export function projectUpdateStatusesForKind(
  kind: ProjectUpdateKind,
): readonly ProjectUpdateStatus[] {
  return kind === "incident"
    ? PROJECT_UPDATE_INCIDENT_STATUSES
    : PROJECT_UPDATE_VISIBILITY_STATUSES;
}

export function defaultProjectUpdateStatusForKind(
  kind: ProjectUpdateKind,
): ProjectUpdateStatus {
  return kind === "incident"
    ? PROJECT_UPDATE_DEFAULT_INCIDENT_STATUS
    : PROJECT_UPDATE_DEFAULT_STATUS;
}

/** Map / clamp a status to one valid for the given kind. */
export function coerceProjectUpdateStatusForKind(
  kind: ProjectUpdateKind,
  status: string | null | undefined,
): ProjectUpdateStatus {
  const allowed = projectUpdateStatusesForKind(kind);
  if (status != null && (allowed as readonly string[]).includes(status)) {
    return status as ProjectUpdateStatus;
  }
  if (kind === "incident") {
    if (status === "published") return "resolved";
    if (status === "internal") return "open";
    return PROJECT_UPDATE_DEFAULT_INCIDENT_STATUS;
  }
  if (status === "resolved") return "published";
  if (status === "open") return "internal";
  return PROJECT_UPDATE_DEFAULT_STATUS;
}

/** Incident severity — only meaningful when kind is `incident`. */
export const PROJECT_UPDATE_SEVERITIES = [
  "high_risk",
  "degraded",
  "low_risk",
] as const;

export const projectUpdateSeveritySchema = z.enum(PROJECT_UPDATE_SEVERITIES);

export type ProjectUpdateSeverity = z.infer<typeof projectUpdateSeveritySchema>;

export const PROJECT_UPDATE_DEFAULT_SEVERITY: ProjectUpdateSeverity = "degraded";

function refineProjectUpdateKindStatus(
  value: { kind?: ProjectUpdateKind; status?: ProjectUpdateStatus },
  ctx: z.RefinementCtx,
) {
  if (value.status == null || value.kind == null) return;
  const allowed = projectUpdateStatusesForKind(value.kind);
  if (!(allowed as readonly string[]).includes(value.status)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status"],
      message:
        value.kind === "incident"
          ? "Incidents use Open / Resolved"
          : "Updates and maintenance use Internal / Published",
    });
  }
}

export const createProjectUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(50_000),
    kind: projectUpdateKindSchema,
    status: projectUpdateStatusSchema.optional(),
    severity: projectUpdateSeveritySchema.nullable().optional(),
    relatedTaskIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    refineProjectUpdateKindStatus(value, ctx);
    if (value.kind === "incident") {
      if (value.severity == null) {
        // Default applied server-side; allow omit.
        return;
      }
      return;
    }
    if (value.severity != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["severity"],
        message: "Severity is only allowed for incidents",
      });
    }
  });

export type CreateProjectUpdateInput = z.infer<typeof createProjectUpdateSchema>;

export const updateProjectUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(50_000).optional(),
    kind: projectUpdateKindSchema.optional(),
    status: projectUpdateStatusSchema.optional(),
    severity: projectUpdateSeveritySchema.nullable().optional(),
    relatedTaskIds: z.array(z.string().min(1)).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    refineProjectUpdateKindStatus(value, ctx);
    if (value.kind != null && value.kind !== "incident" && value.severity != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["severity"],
        message: "Severity is only allowed for incidents",
      });
    }
  });

export type UpdateProjectUpdateInput = z.infer<typeof updateProjectUpdateSchema>;

export const projectUpdateSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  title: z.string(),
  body: z.string(),
  kind: projectUpdateKindSchema,
  status: projectUpdateStatusSchema,
  severity: projectUpdateSeveritySchema.nullable(),
  relatedTaskIds: z.array(z.string()),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  deletedAt: nullableIsoDateSchema,
});

export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

export const projectUpdateListSchema = z.object({
  updates: z.array(projectUpdateSchema),
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

export type Project = z.infer<typeof projectSchema>;

export type Task = z.infer<typeof taskSchema>;

export type TaskApi = z.infer<typeof taskApiSchema>;

export type TaskListItem = z.infer<typeof taskListItemSchema>;

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export type ListTasksResponse = z.infer<typeof listTasksResponseSchema>;

export type TaskLink = z.infer<typeof taskLinkSchema>;

export type TaskComment = z.infer<typeof taskCommentSchema>;

export type TaskActivity = z.infer<typeof taskActivitySchema>;

export type TaskAgentPresence = z.infer<typeof taskAgentPresenceSchema>;

export type UpsertTaskAgentPresenceInput = z.infer<
  typeof upsertTaskAgentPresenceSchema
>;

export type TaskActivityType = z.infer<typeof taskActivityTypeSchema>;

export type CreateTaskActivityInput = z.infer<typeof createTaskActivitySchema>;

export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;

export type ListActivitiesResponse = z.infer<
  typeof listActivitiesResponseSchema
>;

export type UpdateTaskTimerSessionActorInput = z.infer<
  typeof updateTaskTimerSessionActorSchema
>;

export type AgentWorkedActivityData = z.infer<
  typeof agentWorkedActivityDataSchema
>;

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

export type ProjectRepoDocEntry = z.infer<typeof projectRepoDocEntrySchema>;

export type ProjectRepoDocsResponse = z.infer<
  typeof projectRepoDocsResponseSchema
>;

export type ProjectFsCreateEntryResponse = z.infer<
  typeof projectFsCreateEntryResponseSchema
>;

export type ProjectFsDeleteEntryResponse = z.infer<
  typeof projectFsDeleteEntryResponseSchema
>;

export type LocationFsTarget = z.infer<typeof locationFsTargetSchema>;

export type LocationFsEntry = z.infer<typeof locationFsEntrySchema>;

export type LocationFsListResponse = z.infer<
  typeof locationFsListResponseSchema
>;

export type LocationFsCreateFolderInput = z.infer<
  typeof locationFsCreateFolderSchema
>;

export type LocationFsCreateFolderResponse = z.infer<
  typeof locationFsCreateFolderResponseSchema
>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;

export type UpdateTaskCommentInput = z.infer<typeof updateTaskCommentSchema>;

export type ProjectUpdateInput = CreateProjectUpdateInput;

export type TaskAttachment = z.infer<typeof taskAttachmentSchema>;

export type TaskImage = z.infer<typeof taskImageSchema>;

export type TaskImageUploadInput = z.infer<typeof taskImageUploadInputSchema>;

export type RecurringTask = z.infer<typeof recurringTaskSchema>;

export type CreateRecurringTaskInput = z.infer<typeof createRecurringTaskSchema>;

export type UpdateRecurringTaskInput = z.infer<typeof updateRecurringTaskSchema>;
