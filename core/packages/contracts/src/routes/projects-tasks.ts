import { initContract, type AppRouter } from "@ts-rest/core";
import {
  badRequestSchema,
  createProjectSchema,
  createTaskActivitySchema,
  createTaskCommentSchema,
  createTaskSchema,
  documentSchema,
  errorSchema,
  githubBranchSchema,
  githubCommitSchema,
  githubConnectionStatusSchema,
  githubPullRequestFileSchema,
  githubPullRequestSchema,
  githubRepositorySchema,
  listActivitiesQuerySchema,
  listActivitiesResponseSchema,
  locationFsCreateFolderResponseSchema,
  locationFsCreateFolderSchema,
  locationFsListQuerySchema,
  locationFsListResponseSchema,
  projectFsCreateEntryResponseSchema,
  projectFsCreateEntrySchema,
  projectFsDeleteEntryResponseSchema,
  projectFsFileSchema,
  projectFsListEntriesResponseSchema,
  projectFsWriteFileSchema,
  projectRepoDocsResponseSchema,
  projectSchema,
  taskActivitySchema,
  taskCommentSchema,
  taskSchema,
  updateProjectSchema,
  updateTaskCommentSchema,
  updateTaskSchema,
  updateTaskTimerSessionActorSchema,
} from "../schemas.js";
import * as s from "../schemas.js";
import { z } from "zod";

const c = initContract();

/** Projects, tasks, activities, GitHub and location filesystem. */
export const projectsTasksRoutes: AppRouter = c.router({
  listProjects: {
    method: "GET",
    path: "/api/v1/projects",
    query: s.listProjectsQuerySchema,
    responses: {
      200: z.union([
        z.object({ projects: z.array(projectSchema) }),
        s.listPaginatedResponseSchema(projectSchema),
      ]),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List projects (legacy `{ projects }`; paginated `{ items, nextCursor }` with paginated=true)",
  },
  getProject: {
    method: "GET",
    path: "/api/v1/projects/:id",
    pathParams: z.object({
      /** Project id or key (e.g. `OS`). */
      id: z.string(),
    }),
    responses: {
      200: projectSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get project by id or key",
  },
  createProject: {
    method: "POST",
    path: "/api/v1/projects",
    body: createProjectSchema,
    responses: {
      201: projectSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Create project",
  },
  updateProject: {
    method: "PATCH",
    path: "/api/v1/projects/:id",
    pathParams: z.object({
      /** Project id or key (e.g. `OS`). */
      id: z.string(),
    }),
    body: updateProjectSchema,
    responses: {
      200: projectSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update project by id or key",
  },
  deleteProject: {
    method: "DELETE",
    path: "/api/v1/projects/:id",
    pathParams: z.object({
      /** Project id or key (e.g. `OS`). */
      id: z.string(),
    }),
    body: null,
    responses: {
      204: c.noBody(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete project by id or key",
  },
  ensureProjectVault: {
    method: "POST",
    path: "/api/v1/projects/:id/ensure-vault",
    pathParams: z.object({ id: z.string() }),
    body: null,
    responses: {
      200: s.projectVaultEnsureSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Ensure the project vault folder, .cursor skills, and default working directory exist",
  },
  getGithubConnectionStatus: {
    method: "GET",
    path: "/api/v1/github/status",
    responses: {
      200: githubConnectionStatusSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "GitHub OAuth connection status, scopes, and organizations for the signed-in Clerk user",
  },
  listGithubRepositories: {
    method: "GET",
    path: "/api/v1/github/repositories",
    responses: {
      200: z.object({ repositories: z.array(githubRepositorySchema) }),
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List GitHub repositories (personal + organization) for the signed-in Clerk user",
  },
  listProjectGithubBranches: {
    method: "GET",
    path: "/api/v1/projects/:id/github/branches",
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: z.object({
        repository: z.string(),
        defaultBranch: z.string().nullable(),
        branches: z.array(githubBranchSchema),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List branches for the project's linked GitHub repository",
  },
  listProjectGithubCommits: {
    method: "GET",
    path: "/api/v1/projects/:id/github/commits",
    pathParams: z.object({ id: z.string() }),
    query: z.object({
      branch: z.string().min(1),
      page: z.coerce.number().int().positive().optional(),
    }),
    responses: {
      200: z.object({
        repository: z.string(),
        branch: z.string(),
        page: z.number().int().positive(),
        hasMore: z.boolean(),
        commits: z.array(githubCommitSchema),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List commits for a branch on the project's linked GitHub repository",
  },
  getProjectGithubCommit: {
    method: "GET",
    path: "/api/v1/projects/:id/github/commits/:sha",
    pathParams: z.object({
      id: z.string(),
      sha: z.string().min(1),
    }),
    responses: {
      200: z.object({
        repository: z.string(),
        commit: githubCommitSchema,
        files: z.array(githubPullRequestFileSchema),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Get a single commit including changed files and patches for the project's linked repository",
  },
  listProjectGithubPullRequests: {
    method: "GET",
    path: "/api/v1/projects/:id/github/pulls",
    pathParams: z.object({ id: z.string() }),
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
    }),
    responses: {
      200: z.object({
        repository: z.string(),
        page: z.number().int().positive(),
        hasMore: z.boolean(),
        pullRequests: z.array(githubPullRequestSchema),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List open and closed pull requests for the project's linked GitHub repository",
  },
  getProjectGithubPullRequest: {
    method: "GET",
    path: "/api/v1/projects/:id/github/pulls/:number",
    pathParams: z.object({
      id: z.string(),
      number: z.coerce.number().int().positive(),
    }),
    responses: {
      200: z.object({
        repository: z.string(),
        pullRequest: githubPullRequestSchema,
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Get a single pull request (including description and change stats)",
  },
  listProjectGithubPullRequestCommits: {
    method: "GET",
    path: "/api/v1/projects/:id/github/pulls/:number/commits",
    pathParams: z.object({
      id: z.string(),
      number: z.coerce.number().int().positive(),
    }),
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
    }),
    responses: {
      200: z.object({
        repository: z.string(),
        number: z.number().int().positive(),
        page: z.number().int().positive(),
        hasMore: z.boolean(),
        commits: z.array(githubCommitSchema),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List commits on a pull request for the project's linked repository",
  },
  listProjectGithubPullRequestFiles: {
    method: "GET",
    path: "/api/v1/projects/:id/github/pulls/:number/files",
    pathParams: z.object({
      id: z.string(),
      number: z.coerce.number().int().positive(),
    }),
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
    }),
    responses: {
      200: z.object({
        repository: z.string(),
        number: z.number().int().positive(),
        page: z.number().int().positive(),
        hasMore: z.boolean(),
        files: z.array(githubPullRequestFileSchema),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List changed files (with patches) on a pull request for the project's linked repository",
  },
  listProjectRepoDocs: {
    method: "GET",
    path: "/api/v1/projects/:id/docs",
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: projectRepoDocsResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List markdown under a codebase project's docs/ plus root AGENTS.md",
  },
  listProjectFsEntries: {
    method: "GET",
    path: "/api/v1/projects/:id/fs/entries",
    pathParams: z.object({ id: z.string() }),
    query: z.object({
      path: z.string().max(4096).optional(),
    }),
    responses: {
      200: projectFsListEntriesResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List files and folders under a codebase project's local working directory",
  },
  getProjectFsFile: {
    method: "GET",
    path: "/api/v1/projects/:id/fs/file",
    pathParams: z.object({ id: z.string() }),
    query: z.object({
      path: z.string().min(1).max(4096),
    }),
    responses: {
      200: projectFsFileSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Read a text file under the project's local working directory",
  },
  writeProjectFsFile: {
    method: "PUT",
    path: "/api/v1/projects/:id/fs/file",
    pathParams: z.object({ id: z.string() }),
    body: projectFsWriteFileSchema,
    responses: {
      200: projectFsFileSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Write a text file under the project's local working directory",
  },
  createProjectFsEntry: {
    method: "POST",
    path: "/api/v1/projects/:id/fs/entries",
    pathParams: z.object({ id: z.string() }),
    body: projectFsCreateEntrySchema,
    responses: {
      201: projectFsCreateEntryResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Create a file or folder under the project's working directory",
  },
  deleteProjectFsEntry: {
    method: "DELETE",
    path: "/api/v1/projects/:id/fs/entries",
    pathParams: z.object({ id: z.string() }),
    query: z.object({
      path: z.string().min(1).max(4096),
    }),
    body: null,
    responses: {
      200: projectFsDeleteEntryResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Delete a file or folder under the project's working directory",
  },
  listLocationFs: {
    method: "GET",
    path: "/api/v1/location-fs",
    query: locationFsListQuerySchema,
    responses: {
      200: locationFsListResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      502: errorSchema,
    },
    summary:
      "List folders for Dev/Local/Prod location picker (local FS or SSH)",
  },
  createLocationFsFolder: {
    method: "POST",
    path: "/api/v1/location-fs/folders",
    body: locationFsCreateFolderSchema,
    responses: {
      201: locationFsCreateFolderResponseSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      502: errorSchema,
    },
    summary: "Create a folder under a Dev/Local/Prod location base",
  },
  listTasks: {
    method: "GET",
    path: "/api/v1/tasks",
    query: s.listTasksQuerySchema,
    responses: {
      200: s.listTasksResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List tasks (legacy `{ tasks }`; paginated `{ items, nextCursor, appliedDefaults? }` with paginated=true/cursor; default excludes completed/canceled/duplicated — pass status=all or status=…)",
  },
  getTask: {
    method: "GET",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({
      /** Task id or display key (e.g. `OS-51`). */
      id: z.string(),
    }),
    query: z.object({
      /**
       * Comma-separated includes. `comments` returns the last 20 comments
       * inline on the task (OS-64).
       */
      include: z.string().optional(),
    }),
    responses: {
      200: s.taskApiSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get task by id or key (optional include=comments)",
  },
  createTask: {
    method: "POST",
    path: "/api/v1/tasks",
    body: createTaskSchema,
    headers: z
      .object({
        "idempotency-key": z.string().min(1).max(256).optional(),
      })
      .optional(),
    responses: {
      200: s.taskApiSchema,
      201: s.taskApiSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Create task (optional projectKey, contact keys, inline comment; Idempotency-Key)",
  },
  updateTask: {
    method: "PATCH",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({
      /** Task id or display key (e.g. `OS-51`). */
      id: z.string(),
    }),
    body: updateTaskSchema,
    responses: {
      200: s.taskApiSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Update task by id or key (optional inline comment, add/removeLinkedCommitShas)",
  },
  deleteTask: {
    method: "DELETE",
    path: "/api/v1/tasks/:id",
    pathParams: z.object({
      /** Task id or display key (e.g. `OS-51`). */
      id: z.string(),
    }),
    body: null,
    responses: {
      204: c.noBody(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete task by id or key",
  },
  listTaskImages: {
    method: "GET",
    path: "/api/v1/tasks/:id/images",
    pathParams: z.object({ id: z.string() }),
    query: z
      .object({
        /** When set, only images linked to this comment (OS-90). */
        commentId: z.string().optional(),
      })
      .optional(),
    responses: {
      200: s.taskImagesResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List images for a task (optional commentId filter)",
  },
  createTaskImage: {
    method: "POST",
    path: "/api/v1/tasks/:id/images",
    pathParams: z.object({ id: z.string() }),
    headers: z.object({
      "x-filename": z.string().optional(),
      "content-type": z.string().optional(),
    }),
    /**
     * Raw image bytes (default) or JSON `{ data, contentType?, filename?, alt? }`
     * when Content-Type is application/json (OS-90).
     */
    body: c.type<ArrayBuffer | Blob | s.TaskImageUploadInput>(),
    responses: {
      201: s.taskImageSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Upload an image for embedding in a task description (raw bytes or JSON base64)",
  },
  getTaskImage: {
    method: "GET",
    path: "/api/v1/tasks/:id/images/:imageId",
    pathParams: s.taskImageParamsSchema,
    responses: {
      200: c.otherResponse({ contentType: "image/*", body: c.type<Blob>() }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Download a task description or comment image",
  },
  listTaskAttachments: {
    method: "GET",
    path: "/api/v1/tasks/:id/attachments",
    pathParams: s.idParamsSchema,
    responses: {
      200: s.taskAttachmentsResponseSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List task file attachments",
  },
  createTaskAttachment: {
    method: "POST",
    path: "/api/v1/tasks/:id/attachments",
    pathParams: s.idParamsSchema,
    headers: z.object({ "x-filename": z.string().optional() }),
    body: c.type<ArrayBuffer | Blob>(),
    responses: {
      201: s.taskAttachmentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
    summary: "Upload a task file attachment",
  },
  reorderTaskAttachments: {
    method: "POST",
    path: "/api/v1/tasks/:id/attachments/reorder",
    pathParams: s.idParamsSchema,
    body: s.reorderTaskAttachmentsSchema,
    responses: {
      200: s.taskAttachmentsResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Reorder task file attachments",
  },
  getTaskAttachment: {
    method: "GET",
    path: "/api/v1/tasks/:id/attachments/:attachmentId",
    pathParams: s.taskAttachmentParamsSchema,
    responses: {
      200: c.otherResponse({
        contentType: "application/pdf",
        body: c.type<Blob>(),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
    summary: "Download a task file attachment",
  },
  updateTaskAttachment: {
    method: "PATCH",
    path: "/api/v1/tasks/:id/attachments/:attachmentId",
    pathParams: s.taskAttachmentParamsSchema,
    body: s.updateTaskAttachmentSchema,
    responses: {
      200: s.taskAttachmentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Rename a task file attachment",
  },
  deleteTaskAttachment: {
    method: "DELETE",
    path: "/api/v1/tasks/:id/attachments/:attachmentId",
    pathParams: s.taskAttachmentParamsSchema,
    body: null,
    responses: {
      200: s.taskAttachmentSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Delete a task file attachment",
  },
  listTaskDocuments: {
    method: "GET",
    path: "/api/v1/tasks/:id/documents",
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: z.object({ documents: z.array(documentSchema) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List documents linked to a task via front matter linkedTasks",
  },
  getProjectRelations: {
    method: "GET",
    path: "/api/v1/projects/:id/relations",
    pathParams: s.idParamsSchema,
    responses: {
      200: s.projectRelationsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get project relations",
  },
  listDueTasks: {
    method: "GET",
    path: "/api/v1/tasks/due",
    query: s.listDueTasksQuerySchema,
    responses: {
      200: z.union([
        z.object({ tasks: z.array(taskSchema) }),
        s.listPaginatedResponseSchema(
          z.object({
            id: z.string(),
            key: z.string(),
            title: z.string(),
            status: z.string(),
            priority: z.number(),
            projectId: z.string().nullable(),
            dueDate: z.string().nullable(),
            updatedAt: z.string(),
          }),
        ),
      ]),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List tasks due before a date",
  },
  listInboxTasks: {
    method: "GET",
    path: "/api/v1/tasks/inbox",
    responses: {
      200: z.object({ tasks: z.array(taskSchema) }),
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List inbox tasks",
  },
  getTaskRelations: {
    method: "GET",
    path: "/api/v1/tasks/:id/relations",
    pathParams: s.idParamsSchema,
    responses: {
      200: s.taskRelationsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get task relations",
  },
  listActivities: {
    method: "GET",
    path: "/api/v1/activities",
    query: listActivitiesQuerySchema,
    responses: {
      200: listActivitiesResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Unified activity feed (system events + comments). Filter by taskId or projectId; dial types=… for clients (desktop, portal, mobile).",
  },
  listTaskComments: {
    method: "GET",
    path: "/api/v1/tasks/:id/comments",
    pathParams: s.idParamsSchema,
    responses: {
      200: z.object({ comments: z.array(taskCommentSchema) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List comments on a task (legacy alias — prefer GET /api/v1/activities?taskId=&types=comment)",
  },
  listTaskActivities: {
    method: "GET",
    path: "/api/v1/tasks/:id/activities",
    pathParams: s.idParamsSchema,
    responses: {
      200: z.object({ activities: z.array(taskActivitySchema) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "List system activity events on a task (legacy alias — prefer GET /api/v1/activities?taskId=)",
  },
  createTaskActivity: {
    method: "POST",
    path: "/api/v1/tasks/:id/activities",
    pathParams: s.idParamsSchema,
    body: createTaskActivitySchema,
    responses: {
      201: taskActivitySchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Record a client-reported activity event (e.g. agent turn)",
  },
  deleteTaskActivity: {
    method: "DELETE",
    path: "/api/v1/tasks/:taskId/activities/:id",
    pathParams: z.object({ taskId: z.string(), id: z.string() }),
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Delete a timer session activity (paired start/stop) and adjust tracked time",
  },
  updateTaskTimerSessionActor: {
    method: "PATCH",
    path: "/api/v1/tasks/:taskId/activities/:id",
    pathParams: z.object({ taskId: z.string(), id: z.string() }),
    body: updateTaskTimerSessionActorSchema,
    responses: {
      200: taskActivitySchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Change the contact on a timer session (updates paired start/stop)",
  },
  createTaskComment: {
    method: "POST",
    path: "/api/v1/tasks/:id/comments",
    pathParams: s.idParamsSchema,
    body: createTaskCommentSchema,
    responses: {
      201: taskCommentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Create a comment on a task",
  },
  updateTaskComment: {
    method: "PATCH",
    path: "/api/v1/tasks/:taskId/comments/:id",
    pathParams: z.object({ taskId: z.string(), id: z.string() }),
    body: updateTaskCommentSchema,
    responses: {
      200: taskCommentSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update a task comment",
  },
  deleteTaskComment: {
    method: "DELETE",
    path: "/api/v1/tasks/:taskId/comments/:id",
    pathParams: z.object({ taskId: z.string(), id: z.string() }),
    body: c.noBody(),
    responses: {
      204: c.noBody(),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete a task comment",
  },
  batchUpdateTasks: {
    method: "POST",
    path: "/api/v1/tasks/batch",
    body: s.batchUpdateTasksSchema,
    responses: {
      200: s.batchUpdateTasksResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Batch update tasks by id or key; unknown refs return not_found in results (no upsert)",
  },
  reorderTasks: {
    method: "POST",
    path: "/api/v1/tasks/reorder",
    body: s.reorderSchema,
    responses: {
      200: z.object({ tasks: z.array(taskSchema) }),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Reorder tasks",
  },
  moveTask: {
    method: "POST",
    path: "/api/v1/tasks/:id/move",
    pathParams: s.idParamsSchema,
    body: s.moveTaskSchema,
    responses: {
      200: taskSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Move a task",
  },
  triageTask: {
    method: "POST",
    path: "/api/v1/tasks/:id/triage",
    pathParams: s.idParamsSchema,
    body: s.triageTaskSchema,
    responses: {
      200: taskSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Triage a task",
  },
});
