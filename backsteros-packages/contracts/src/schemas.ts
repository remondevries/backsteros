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

export const API_KEY_SCOPES = [
  "projects:read",
  "projects:write",
  "tasks:read",
  "tasks:write",
  "documents:read",
  "documents:write",
  "letters:read",
  "search:query",
] as const;

export const taskStatusSchema = z.enum(TASK_STATUSES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);

export const errorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export const healthSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});

export const projectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
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
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: z.number().int().min(0).max(4),
  sortOrder: z.number().int(),
  dueDate: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export const createTaskSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  status: taskStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  sortOrder: z.number().int().optional(),
  dueDate: z.string().datetime().optional(),
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

export const createApiKeyResponseSchema = z.object({
  apiKey: apiKeySchema,
  secret: z.string(),
});

export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type ApiKey = z.infer<typeof apiKeySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
