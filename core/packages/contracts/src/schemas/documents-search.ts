import { z } from "zod";

import {
  DOCUMENT_TYPES,
  documentTypeSchema,
  isoDateSchema,
  nullableIsoDateSchema,
  projectStatusSchema,
  taskStatusSchema,
} from "./common.js";
import {
  DOCUMENT_PROPERTY_TYPE_KEY_PATTERN,
  DOCUMENT_PROPERTY_TYPE_KINDS,
  DOCUMENT_PROPERTY_TYPE_STATUSES,
} from "../document-property-types.js";
import { projectSchema, taskSchema } from "./projects-tasks.js";
import { contactSchema, letterSchema, organizationSchema } from "./crm-portal.js";
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
  publishStatus: z.enum(["concept", "published", "offline"]).default("concept"),
  publishSlug: z.string().nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  audience: z.enum(["group", "individual"]).default("group"),
  contactIds: z.array(z.string()).nullable().optional(),
  placementFolderId: z.string().nullable().optional(),
  coverStorageKey: z.string().nullable().optional(),
  coverContentType: z.string().nullable().optional(),
  /** Manual / timer tracked duration (whole minutes; legacy). */
  trackedMinutes: z.number().int().nonnegative().nullable().optional(),
  /** Manual / timer tracked duration (whole seconds). */
  trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
  /** Last time tracked duration was set (time-report grouping stamp). */
  lastTrackedAt: z.string().datetime().nullable().optional(),
  docKey: z.string().nullable().optional(),
  properties: z.record(z.unknown()).optional(),
  frontMatterValid: z.boolean().optional(),
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
    publishStatus: z.enum(["concept", "published", "offline"]).optional(),
    publishSlug: z.string().max(500).nullable().optional(),
    seoTitle: z.string().max(500).nullable().optional(),
    seoDescription: z.string().max(5000).nullable().optional(),
    audience: z.enum(["group", "individual"]).optional(),
    contactIds: z.array(z.string()).nullable().optional(),
    placementFolderId: z.string().nullable().optional(),
    trackedMinutes: z.number().int().nonnegative().nullable().optional(),
    trackedDurationSeconds: z.number().int().nonnegative().nullable().optional(),
    lastTrackedAt: z.string().datetime().nullable().optional(),
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

export const documentPropertiesResponseSchema = z.object({
  docKey: z.string().nullable(),
  properties: z.record(z.unknown()),
  frontMatterValid: z.boolean(),
  contentVersion: z.number().int().positive(),
});

export const putDocumentPropertiesSchema = z
  .object({
    properties: z.record(z.unknown()),
    ifMatchVersion: z.number().int().positive().optional(),
  })
  .refine((value) => Object.keys(value.properties).length > 0, {
    message: "At least one property is required",
  });

export const putDocumentPropertiesResponseSchema =
  documentPropertiesResponseSchema.extend({
    contentVersion: z.number().int().positive(),
  });

export const documentPropertyTypeKindSchema = z.enum(
  DOCUMENT_PROPERTY_TYPE_KINDS,
);

export const documentPropertyTypeStatusSchema = z.enum(
  DOCUMENT_PROPERTY_TYPE_STATUSES,
);

export const documentPropertyTypeOptionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
});

export const documentPropertyTypeSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  kind: documentPropertyTypeKindSchema,
  options: z.array(documentPropertyTypeOptionSchema),
  multiple: z.boolean(),
  projectId: z.string().nullable(),
  status: documentPropertyTypeStatusSchema,
  seeded: z.boolean(),
  proposedByContactId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const documentPropertyTypeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(DOCUMENT_PROPERTY_TYPE_KEY_PATTERN, "key must be English camelCase");

export const createDocumentPropertyTypeSchema = z.object({
  key: documentPropertyTypeKeySchema,
  label: z.string().trim().min(1).max(80),
  kind: documentPropertyTypeKindSchema,
  options: z.array(documentPropertyTypeOptionSchema).max(100).optional(),
  multiple: z.boolean().optional(),
  projectId: z.string().min(1).nullable().optional(),
});

export const updateDocumentPropertyTypeSchema = z
  .object({
    key: documentPropertyTypeKeySchema.optional(),
    label: z.string().trim().min(1).max(80).optional(),
    kind: documentPropertyTypeKindSchema.optional(),
    options: z.array(documentPropertyTypeOptionSchema).max(100).optional(),
    multiple: z.boolean().optional(),
    projectId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listDocumentPropertyTypesQuerySchema = z.object({
  status: documentPropertyTypeStatusSchema.optional(),
  projectId: z.string().optional(),
});

export const listDocumentPropertyTypesResponseSchema = z.object({
  types: z.array(documentPropertyTypeSchema),
});

/** Comma-separated or repeated multi-value query string. */
export const multiValueQuerySchema = z.string().min(1).optional();

export const documentSectionResponseSchema = z.object({
  heading: z.string(),
  headingPath: z.array(z.string()),
  slug: z.string(),
  text: z.string(),
  contentVersion: z.number().int().positive(),
});

export const updateDocumentSectionSchema = z.object({
  heading: z.string().min(1).max(500),
  body: z.string().max(5_000_000),
  ifMatchVersion: z.number().int().positive().optional(),
});

export const documentRetrievalHitSchema = z.object({
  documentId: z.string(),
  docKey: z.string().nullable(),
  title: z.string(),
  heading: z.string(),
  headingPath: z.array(z.string()),
  slug: z.string(),
  text: z.string(),
  score: z.number(),
});

export const documentRetrievalResponseSchema = z.object({
  results: z.array(documentRetrievalHitSchema),
  budget: z.number().int().positive(),
  truncated: z.boolean(),
});

export const documentRetrievalQuerySchema = z.object({
  q: z.string().min(1).max(2000),
  /** Semantic property type (comma-separated or repeated). */
  type: multiValueQuerySchema,
  audience: multiValueQuerySchema,
  status: multiValueQuerySchema,
  /** Project key from the properties index. */
  project: multiValueQuerySchema,
  budget: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/** Document hit from `GET /search` (type = project | knowledge | journal). */
export const documentSearchResultSchema = z.object({
  id: z.string(),
  type: documentTypeSchema,
  projectId: z.string().nullable(),
  path: z.string(),
  title: z.string(),
  snippet: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

/** Task hit from `GET /search?type=task` (alias `tasks`). */
export const taskSearchResultSchema = z.object({
  id: z.string(),
  type: z.literal("task"),
  key: z.string(),
  projectId: z.string().nullable(),
  status: taskStatusSchema,
  title: z.string(),
  snippet: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const searchResultSchema = z.union([
  documentSearchResultSchema,
  taskSearchResultSchema,
]);

/** Query `type` for `/search`: document types + `task` (alias `tasks`). */
export const SEARCH_TYPE_QUERY_VALUES = [
  ...DOCUMENT_TYPES,
  "task",
  "tasks",
] as const;

export const searchTypeQuerySchema = z.enum(SEARCH_TYPE_QUERY_VALUES);

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  type: searchTypeQuerySchema.optional(),
  projectId: z.string().optional(),
  /**
   * Comma-separated task statuses, or `all` (only applied when type=task|tasks
   * or include=task). Omit to exclude completed/canceled/duplicated (OS-81) —
   * see `appliedDefaults`.
   */
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
  /**
   * When searching documents (type omitted or a document type), also run task
   * search for the same `q` and merge hits (OS-76 multi-resource).
   * Values: `task` | `tasks`.
   */
  include: z.enum(["task", "tasks"]).optional(),
});

export const searchResponseSchema = z.object({
  results: z.array(searchResultSchema),
  /** Present for `type=task` (opaque keyset on updatedAt desc, id). */
  nextCursor: z.string().nullable().optional(),
  /**
   * Present when task search hid terminal statuses by default (OS-81).
   * Absent when `status` is given. Exact key/id hits still return regardless.
   */
  appliedDefaults: z
    .object({
      excludedStatuses: z.array(z.string()).min(1),
    })
    .optional(),
});

/** Max queries per `POST /api/v1/search/batch` (OS-76). */
export const SEARCH_BATCH_MAX_QUERIES = 10;

const searchBatchSearchItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal("search"),
  q: z.string().min(1).max(500),
  type: searchTypeQuerySchema.optional(),
  projectId: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
  include: z.enum(["task", "tasks"]).optional(),
});

const searchBatchRetrieveItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal("retrieve"),
  q: z.string().min(1).max(2000),
  type: multiValueQuerySchema.optional(),
  audience: multiValueQuerySchema.optional(),
  status: multiValueQuerySchema.optional(),
  project: multiValueQuerySchema.optional(),
  budget: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export const searchBatchQueryItemSchema = z.discriminatedUnion("kind", [
  searchBatchSearchItemSchema,
  searchBatchRetrieveItemSchema,
]);

export const searchBatchRequestSchema = z.object({
  queries: z
    .array(searchBatchQueryItemSchema)
    .min(1)
    .max(SEARCH_BATCH_MAX_QUERIES),
});

export const searchBatchSearchResponseItemSchema = z.object({
  id: z.string(),
  kind: z.literal("search"),
  results: z.array(searchResultSchema),
  nextCursor: z.string().nullable().optional(),
  appliedDefaults: z
    .object({
      excludedStatuses: z.array(z.string()).min(1),
    })
    .optional(),
});

export const searchBatchRetrieveResponseItemSchema = z.object({
  id: z.string(),
  kind: z.literal("retrieve"),
  results: z.array(documentRetrievalHitSchema),
  budget: z.number().int().positive(),
  truncated: z.boolean(),
  skipped: z.number().int().nonnegative(),
});

export const searchBatchErrorResponseItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["search", "retrieve"]),
  error: z.string(),
  field: z.string().optional(),
});

export const searchBatchResponseItemSchema = z.union([
  searchBatchSearchResponseItemSchema,
  searchBatchRetrieveResponseItemSchema,
  searchBatchErrorResponseItemSchema,
]);

export const searchBatchResponseSchema = z.object({
  results: z.array(searchBatchResponseItemSchema),
});

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
  /** Project UUID (tasks + project-documents). */
  projectId: z.string().nullable().optional(),
  /** Task display key (`OS-73`) — same field as `GET /search?type=task`. */
  key: z.string().optional(),
  /** Task status — same field as `GET /search?type=task`. */
  status: taskStatusSchema.optional(),
  /** Project status on project hits (OS-7 palette / global-search). */
  projectStatus: projectStatusSchema.optional(),
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

export type Document = z.infer<typeof documentSchema>;

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export type DocumentPropertyType = z.infer<typeof documentPropertyTypeSchema>;

export type CreateDocumentPropertyTypeInput = z.infer<
  typeof createDocumentPropertyTypeSchema
>;

export type UpdateDocumentPropertyTypeInput = z.infer<
  typeof updateDocumentPropertyTypeSchema
>;

export type DocumentContent = z.infer<typeof documentContentSchema>;

export type UpdateDocumentContentInput = z.infer<typeof updateDocumentContentSchema>;

export type DocumentSearchResult = z.infer<typeof documentSearchResultSchema>;

export type TaskSearchResult = z.infer<typeof taskSearchResultSchema>;

export type SearchResult = z.infer<typeof searchResultSchema>;

export type SearchTypeQuery = z.infer<typeof searchTypeQuerySchema>;

export type SearchBatchRequest = z.infer<typeof searchBatchRequestSchema>;

export type SearchBatchResponse = z.infer<typeof searchBatchResponseSchema>;

export type SearchBatchQueryItem = z.infer<typeof searchBatchQueryItemSchema>;

export type Mention = z.infer<typeof mentionSchema>;

export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>;
