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
  "settings:read",
  "settings:write",
  "avatars:read",
  "avatars:write",
  "search:query",
] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

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
  status: projectStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createProjectSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-_]*$/i, "Use letters, numbers, hyphens, underscores"),
  name: z.string().min(1).max(255),
  summary: z.string().max(2000).optional(),
  description: z.string().max(10000).optional(),
  organizationId: z.string().nullable().optional(),
  areaId: z.string().nullable().optional(),
  area: z.enum(["personal", "business", "clients"]).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  status: projectStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateProjectSchema = createProjectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
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
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createTaskSchema = z.object({
  projectId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  triagedAt: z.string().datetime().nullable().optional(),
  inbox: z.boolean().optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(apiKeyScopeSchema).min(1),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(128),
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

export const areaInputSchema = z.object({
  name: z.string().min(1).max(255),
  icon: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateAreaSchema = areaInputSchema.partial();
export const areaSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
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

export const settingsSchema = z.record(z.unknown());
export const settingsResponseSchema = z.object({ settings: settingsSchema });
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

export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
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
export type Area = z.infer<typeof areaSchema>;
export type Letter = z.infer<typeof letterSchema>;
export type LetterAttachment = z.infer<typeof letterAttachmentSchema>;
export type Avatar = z.infer<typeof avatarSchema>;
export type Mention = z.infer<typeof mentionSchema>;
export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>;
export type PowerSyncCredentials = z.infer<typeof powerSyncCredentialsSchema>;
export type PowerSyncWriteInput = z.infer<typeof powerSyncWriteSchema>;
