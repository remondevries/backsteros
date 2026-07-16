import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  apiKeySchema,
  createApiKeyResponseSchema,
  createApiKeySchema,
  createProjectSchema,
  createTaskSchema,
  errorSchema,
  healthSchema,
  projectSchema,
  taskSchema,
  updateProjectSchema,
  updateTaskSchema,
} from "./schemas.js";

const c = initContract();

export const apiContract = c.router(
  {
    health: {
      method: "GET",
      path: "/health",
      responses: {
        200: healthSchema,
      },
      summary: "Health check",
    },
    listProjects: {
      method: "GET",
      path: "/api/v1/projects",
      responses: {
        200: z.object({ projects: z.array(projectSchema) }),
        401: errorSchema,
      },
      summary: "List projects",
    },
    getProject: {
      method: "GET",
      path: "/api/v1/projects/:id",
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: projectSchema,
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Get project by id",
    },
    createProject: {
      method: "POST",
      path: "/api/v1/projects",
      body: createProjectSchema,
      responses: {
        201: projectSchema,
        400: errorSchema,
        401: errorSchema,
      },
      summary: "Create project",
    },
    updateProject: {
      method: "PATCH",
      path: "/api/v1/projects/:id",
      pathParams: z.object({ id: z.string() }),
      body: updateProjectSchema,
      responses: {
        200: projectSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Update project",
    },
    deleteProject: {
      method: "DELETE",
      path: "/api/v1/projects/:id",
      pathParams: z.object({ id: z.string() }),
      body: null,
      responses: {
        204: c.noBody(),
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Soft-delete project",
    },
    listTasks: {
      method: "GET",
      path: "/api/v1/tasks",
      query: z.object({
        projectId: z.string().optional(),
      }),
      responses: {
        200: z.object({ tasks: z.array(taskSchema) }),
        401: errorSchema,
      },
      summary: "List tasks",
    },
    getTask: {
      method: "GET",
      path: "/api/v1/tasks/:id",
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: taskSchema,
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Get task by id",
    },
    createTask: {
      method: "POST",
      path: "/api/v1/tasks",
      body: createTaskSchema,
      responses: {
        201: taskSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Create task",
    },
    updateTask: {
      method: "PATCH",
      path: "/api/v1/tasks/:id",
      pathParams: z.object({ id: z.string() }),
      body: updateTaskSchema,
      responses: {
        200: taskSchema,
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Update task",
    },
    deleteTask: {
      method: "DELETE",
      path: "/api/v1/tasks/:id",
      pathParams: z.object({ id: z.string() }),
      body: null,
      responses: {
        204: c.noBody(),
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Soft-delete task",
    },
    listApiKeys: {
      method: "GET",
      path: "/api/v1/api-keys",
      responses: {
        200: z.object({ apiKeys: z.array(apiKeySchema) }),
        401: errorSchema,
      },
      summary: "List API keys (Clerk session)",
    },
    createApiKey: {
      method: "POST",
      path: "/api/v1/api-keys",
      body: createApiKeySchema,
      responses: {
        201: createApiKeyResponseSchema,
        400: errorSchema,
        401: errorSchema,
      },
      summary: "Create API key (Clerk session; secret shown once)",
    },
    revokeApiKey: {
      method: "DELETE",
      path: "/api/v1/api-keys/:id",
      pathParams: z.object({ id: z.string() }),
      body: null,
      responses: {
        204: c.noBody(),
        401: errorSchema,
        404: errorSchema,
      },
      summary: "Revoke API key (Clerk session)",
    },
  },
  {
    pathPrefix: "",
  },
);

export type ApiContract = typeof apiContract;
