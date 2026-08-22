import { useCallback } from "react";
import type {
  Project as ApiProject,
  Task as ApiTask,
  TaskLink,
} from "@backsteros/contracts";
import { allocateUniqueProjectKey, toApiDueDateIso } from "@backsteros/ui";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { resolveCreateAssigneeId } from "../default-assignee";
import {
  cloneTaskLinksForDuplicate,
  parseTaskLinks,
  resolveDuplicateTaskStatus,
} from "./row-mappers";
import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";

/** Task creation and task/project duplication flows. */
export function useWorkspaceTaskActions({
  authenticated,
  client,
  powerSync,
  toSnakeFields,
  rawTasks,
  rawInboxTasks,
  rawProjects,
  setApiTasks,
  setApiInboxTasks,
  setApiProjects,
}: {
  authenticated: boolean;
  client: BacksterosApiClient;
  powerSync: WorkspacePowerSync;
  toSnakeFields: (values: Record<string, unknown>) => Record<string, unknown>;
  rawTasks: ApiTask[];
  rawInboxTasks: ApiTask[];
  rawProjects: ApiProject[];
  setApiTasks: ApiRowsSetter<ApiTask>;
  setApiInboxTasks: ApiRowsSetter<ApiTask>;
  setApiProjects: ApiRowsSetter<ApiProject>;
}) {
  const createInboxTask = useCallback(
    async (input: {
      title: string;
      description?: string;
      status?: string;
      priority?: number;
      assigneeId?: string | null;
      dueDate?: string | null;
      links?: TaskLink[];
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      if (!authenticated) throw new Error("Sign in to create inbox tasks.");
      const body = {
        title,
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        status: input.status ?? "triage",
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        dueDate: toApiDueDateIso(input.dueDate),
        inbox: true,
        projectId: null,
        ...(input.links && input.links.length > 0 ? { links: input.links } : {}),
      };
      // API-first so the task has a durable id + number before navigation
      // (PowerSync-only creates raced the query and showed "Task not found").
      let task: ApiTask;
      try {
        task = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        // Stale default assignee — retry unassigned once.
        if (
          body.assigneeId &&
          error instanceof Error &&
          (error.message.toLowerCase().includes("assignee") ||
            ("code" in error &&
              (error as { code?: string }).code === "assignee_not_found"))
        ) {
          task = await client.requestJson<ApiTask>("/api/v1/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, assigneeId: null }),
          });
        } else {
          throw error;
        }
      }
      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      setApiInboxTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "tasks",
            toSnakeFields({ ...body, number: task.number }),
            task.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return { id: task.id, number: task.number ?? null };
    },
    [
      authenticated,
      client,
      powerSync,
      setApiInboxTasks,
      setApiTasks,
      toSnakeFields,
    ],
  );

  const createProjectTask = useCallback(
    async (input: {
      projectId: string;
      title: string;
      description?: string;
      status?: string;
      priority?: number;
      assigneeId?: string | null;
      dueDate?: string | null;
      links?: TaskLink[];
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      if (!input.projectId.trim()) throw new Error("Project is required.");
      if (!authenticated) throw new Error("Sign in to create tasks.");
      const body = {
        projectId: input.projectId,
        title,
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        status: input.status ?? "ready_to_start",
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        dueDate: toApiDueDateIso(input.dueDate),
        inbox: false,
        ...(input.links && input.links.length > 0 ? { links: input.links } : {}),
      };
      // API-first — same rationale as createInboxTask / createLetter.
      let task: ApiTask;
      try {
        task = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (
          body.assigneeId &&
          error instanceof Error &&
          (error.message.toLowerCase().includes("assignee") ||
            ("code" in error &&
              (error as { code?: string }).code === "assignee_not_found"))
        ) {
          task = await client.requestJson<ApiTask>("/api/v1/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, assigneeId: null }),
          });
        } else {
          throw error;
        }
      }
      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "tasks",
            toSnakeFields({ ...body, number: task.number }),
            task.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return { id: task.id, number: task.number ?? null };
    },
    [authenticated, client, powerSync, setApiTasks, toSnakeFields],
  );

  const createTaskFromBody = useCallback(
    async (body: Record<string, unknown>) => {
      let task: ApiTask;
      try {
        task = await client.requestJson<ApiTask>("/api/v1/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (
          body.assigneeId &&
          error instanceof Error &&
          (error.message.toLowerCase().includes("assignee") ||
            ("code" in error &&
              (error as { code?: string }).code === "assignee_not_found"))
        ) {
          task = await client.requestJson<ApiTask>("/api/v1/tasks", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, assigneeId: null }),
          });
        } else {
          throw error;
        }
      }

      setApiTasks((rows) => {
        if (!rows) return [task];
        if (rows.some((entry) => entry.id === task.id)) return rows;
        return [task, ...rows];
      });
      if (task.inbox) {
        setApiInboxTasks((rows) => {
          if (!rows) return [task];
          if (rows.some((entry) => entry.id === task.id)) return rows;
          return [task, ...rows];
        });
      }
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "tasks",
            toSnakeFields({ ...body, number: task.number }),
            task.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }
      return task;
    },
    [client, powerSync, setApiInboxTasks, setApiTasks, toSnakeFields],
  );

  const duplicateTask = useCallback(
    async (sourceId: string) => {
      if (!authenticated) throw new Error("Sign in to duplicate tasks.");
      const source =
        rawTasks.find((entry) => entry.id === sourceId) ??
        rawInboxTasks.find((entry) => entry.id === sourceId) ??
        null;
      if (!source) {
        throw new Error("Task not found.");
      }

      const title = source.title.trim();
      if (!title) throw new Error("Task title is required.");

      const links = cloneTaskLinksForDuplicate(parseTaskLinks(source.links));
      const body = {
        title,
        ...(source.description?.trim()
          ? { description: source.description.trim() }
          : {}),
        status: resolveDuplicateTaskStatus(source),
        priority: source.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(source.assigneeId),
        dueDate: toApiDueDateIso(source.dueDate),
        dueEndDate: toApiDueDateIso(source.dueEndDate ?? null),
        projectId: source.projectId ?? null,
        contactId: source.contactId ?? null,
        inbox: Boolean(source.inbox),
        ...(links.length > 0 ? { links } : {}),
      };

      const task = await createTaskFromBody(body);
      return { id: task.id, number: task.number ?? null };
    },
    [
      authenticated,
      createTaskFromBody,
      rawInboxTasks,
      rawTasks,
    ],
  );

  const duplicateProject = useCallback(
    async (sourceId: string, options?: { includeTasks?: boolean }) => {
      if (!authenticated) throw new Error("Sign in to duplicate projects.");
      const source =
        rawProjects.find((entry) => entry.id === sourceId) ?? null;
      if (!source) {
        throw new Error("Project not found.");
      }

      const name = source.name.trim();
      if (!name) throw new Error("Project name is required.");

      const existingKeys = rawProjects.map((project) => project.key);
      const keyCandidates = [
        allocateUniqueProjectKey(source.key, existingKeys),
        ...Array.from({ length: 12 }, (_, index) =>
          allocateUniqueProjectKey(
            `${source.key}${index + 2}`,
            existingKeys,
          ),
        ),
      ];
      const uniqueCandidates = [...new Set(keyCandidates)];

      const bodyBase = {
        name: `${name} copy`,
        ...(source.summary?.trim() ? { summary: source.summary.trim() } : {}),
        ...(source.description?.trim()
          ? { description: source.description.trim() }
          : {}),
        organizationId: source.organizationId ?? null,
        areaId: source.areaId ?? null,
        area: source.area ?? null,
        startDate: source.startDate ?? null,
        dueDate: source.dueDate ?? null,
        icon: source.icon ?? null,
        color: source.color ?? null,
        type: source.type ?? "general",
        status: source.status ?? "backlog",
        priority: source.priority ?? 0,
        sortOrder: -Date.now(),
      };

      let project: ApiProject | null = null;
      let lastError: unknown = null;
      for (const key of uniqueCandidates) {
        try {
          project = await client.requestJson<ApiProject>("/api/v1/projects", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...bodyBase, key }),
          });
          break;
        } catch (error) {
          lastError = error;
          const isKeyConflict =
            error instanceof Error &&
            (error.message.toLowerCase().includes("project key") ||
              ("code" in error &&
                (error as { code?: string }).code === "project_key_exists"));
          if (!isKeyConflict) {
            throw error;
          }
          existingKeys.push(key);
        }
      }
      if (!project) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Failed to duplicate project.");
      }
      const createdProject = project;

      setApiProjects((rows) => {
        if (!rows) return [createdProject];
        if (rows.some((entry) => entry.id === createdProject.id)) return rows;
        return [createdProject, ...rows];
      });
      if (powerSync.ready && powerSync.createMetadata) {
        try {
          await powerSync.createMetadata(
            "projects",
            toSnakeFields({
              key: createdProject.key,
              name: createdProject.name,
              status: createdProject.status,
              area: createdProject.area ?? null,
              sortOrder: bodyBase.sortOrder,
              organizationId: createdProject.organizationId ?? null,
              ...(createdProject.type ? { type: createdProject.type } : {}),
            }),
            createdProject.id,
          );
        } catch {
          // Download sync will eventually bring the row in.
        }
      }

      if (options?.includeTasks) {
        const sourceTasks = [...rawTasks, ...rawInboxTasks]
          .filter((task) => task.projectId === source.id && !task.deletedAt)
          .sort((a, b) => {
            const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            if (order !== 0) return order;
            return (a.number ?? 0) - (b.number ?? 0);
          });

        // Deduplicate by id (task may appear in both lists).
        const seen = new Set<string>();
        let sortBase = Date.now();
        for (const sourceTask of sourceTasks) {
          if (seen.has(sourceTask.id)) continue;
          seen.add(sourceTask.id);
          const title = sourceTask.title.trim();
          if (!title) continue;
          const links = cloneTaskLinksForDuplicate(
            parseTaskLinks(sourceTask.links),
          );
          await createTaskFromBody({
            projectId: createdProject.id,
            title,
            ...(sourceTask.description?.trim()
              ? { description: sourceTask.description.trim() }
              : {}),
            status: resolveDuplicateTaskStatus(sourceTask),
            priority: sourceTask.priority ?? 0,
            sortOrder: sortBase++,
            assigneeId: resolveCreateAssigneeId(sourceTask.assigneeId),
            dueDate: toApiDueDateIso(sourceTask.dueDate),
            dueEndDate: toApiDueDateIso(sourceTask.dueEndDate ?? null),
            contactId: sourceTask.contactId ?? null,
            inbox: false,
            ...(links.length > 0 ? { links } : {}),
          });
        }
      }

      return { id: createdProject.id, key: createdProject.key };
    },
    [
      authenticated,
      client,
      createTaskFromBody,
      powerSync,
      rawInboxTasks,
      rawProjects,
      rawTasks,
      setApiProjects,
      toSnakeFields,
    ],
  );

  return {
    createInboxTask,
    createProjectTask,
    duplicateTask,
    duplicateProject,
  };
}
