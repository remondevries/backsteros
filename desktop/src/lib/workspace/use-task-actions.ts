import { useCallback } from "react";
import type {
  Project as ApiProject,
  Task as ApiTask,
  TaskLink,
} from "@backsteros/contracts";
import { allocateUniqueProjectKey, toApiDueDateIso } from "@backsteros/ui";
import type { BacksterosApiClient } from "@backsteros/api-client";

import { resolveCreateAssigneeId } from "../default-assignee";
import { optimisticLocalMetadataCreate } from "./optimistic-local-metadata-create";
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
      relatedContactIds?: string[];
      relatedOrganizationIds?: string[];
      dueDate?: string | null;
      links?: TaskLink[];
      /**
       * Triage capture defaults to true. Due-list creates (Today/Tomorrow/…)
       * must pass false so the task stays on the tasks overview (`!inbox`).
       */
      inbox?: boolean;
    }) => {
      const title = input.title.trim();
      if (!title) throw new Error("Task title is required.");
      if (!authenticated) throw new Error("Sign in to create inbox tasks.");
      const inbox = input.inbox ?? true;
      const body = {
        title,
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        status: input.status ?? (inbox ? "triage" : "ready_to_start"),
        priority: input.priority ?? 0,
        sortOrder: Date.now(),
        assigneeId: resolveCreateAssigneeId(input.assigneeId),
        ...(input.relatedContactIds && input.relatedContactIds.length > 0
          ? { relatedContactIds: input.relatedContactIds }
          : {}),
        ...(input.relatedOrganizationIds &&
        input.relatedOrganizationIds.length > 0
          ? { relatedOrganizationIds: input.relatedOrganizationIds }
          : {}),
        dueDate: toApiDueDateIso(input.dueDate),
        inbox,
        projectId: null,
        ...(input.links && input.links.length > 0 ? { links: input.links } : {}),
      };
      // Linear-shaped: one write path. When PowerSync is ready, local create +
      // upload only — no REST dual-write.
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const task = {
          id,
          number: null,
          ...body,
          createdAt: now,
          updatedAt: now,
        } as ApiTask;
        const rollback = () => {
          setApiTasks((rows) => rows?.filter((entry) => entry.id !== id) ?? null);
          if (inbox) {
            setApiInboxTasks(
              (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
            );
          }
        };
        const { number } = await optimisticLocalMetadataCreate({
          id,
          applyOptimistic: () => {
            setApiTasks((rows) => {
              if (!rows) return [task];
              if (rows.some((entry) => entry.id === task.id)) return rows;
              return [task, ...rows];
            });
            if (inbox) {
              setApiInboxTasks((rows) => {
                if (!rows) return [task];
                if (rows.some((entry) => entry.id === task.id)) return rows;
                return [task, ...rows];
              });
            }
          },
          rollback,
          createMetadata: () =>
            powerSync.createMetadata!(
              "tasks",
              toSnakeFields({ ...body, number: null }),
              id,
            ),
          errorLabel: "local task create",
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/tasks/${encodeURIComponent(id)}`,
            setters: inbox
              ? [setApiTasks, setApiInboxTasks]
              : [setApiTasks],
          },
        });
        return { id: task.id, number };
      }

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
      if (task.inbox) {
        setApiInboxTasks((rows) => {
          if (!rows) return [task];
          if (rows.some((entry) => entry.id === task.id)) return rows;
          return [task, ...rows];
        });
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
      relatedContactIds?: string[];
      relatedOrganizationIds?: string[];
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
        ...(input.relatedContactIds && input.relatedContactIds.length > 0
          ? { relatedContactIds: input.relatedContactIds }
          : {}),
        ...(input.relatedOrganizationIds &&
        input.relatedOrganizationIds.length > 0
          ? { relatedOrganizationIds: input.relatedOrganizationIds }
          : {}),
        dueDate: toApiDueDateIso(input.dueDate),
        inbox: false,
        ...(input.links && input.links.length > 0 ? { links: input.links } : {}),
      };
      // Linear-shaped: PowerSync-ready → local create only (no REST dual-write).
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const task = {
          id,
          number: null,
          ...body,
          createdAt: now,
          updatedAt: now,
        } as ApiTask;
        const { number } = await optimisticLocalMetadataCreate({
          id,
          applyOptimistic: () => {
            setApiTasks((rows) => {
              if (!rows) return [task];
              if (rows.some((entry) => entry.id === task.id)) return rows;
              return [task, ...rows];
            });
          },
          rollback: () =>
            setApiTasks((rows) => rows?.filter((entry) => entry.id !== id) ?? null),
          createMetadata: () =>
            powerSync.createMetadata!(
              "tasks",
              toSnakeFields({ ...body, number: null }),
              id,
            ),
          errorLabel: "local project task create",
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/tasks/${encodeURIComponent(id)}`,
            setters: [setApiTasks],
          },
        });
        return { id: task.id, number };
      }

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
      return { id: task.id, number: task.number ?? null };
    },
    [authenticated, client, powerSync, setApiInboxTasks, setApiTasks, toSnakeFields],
  );

  const createTaskFromBody = useCallback(
    async (body: Record<string, unknown>) => {
      if (powerSync.ready && powerSync.createMetadata) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const inbox = Boolean(body.inbox);
        const task = {
          id,
          number: null,
          ...body,
          createdAt: now,
          updatedAt: now,
        } as ApiTask;
        const { number } = await optimisticLocalMetadataCreate({
          id,
          applyOptimistic: () => {
            setApiTasks((rows) => {
              if (!rows) return [task];
              if (rows.some((entry) => entry.id === task.id)) return rows;
              return [task, ...rows];
            });
            if (inbox) {
              setApiInboxTasks((rows) => {
                if (!rows) return [task];
                if (rows.some((entry) => entry.id === task.id)) return rows;
                return [task, ...rows];
              });
            }
          },
          rollback: () => {
            setApiTasks((rows) => rows?.filter((entry) => entry.id !== id) ?? null);
            if (inbox) {
              setApiInboxTasks(
                (rows) => rows?.filter((entry) => entry.id !== id) ?? null,
              );
            }
          },
          createMetadata: () =>
            powerSync.createMetadata!(
              "tasks",
              toSnakeFields({ ...body, number: null }),
              id,
            ),
          errorLabel: "local task create",
          resolveNumberAfterUpload: {
            client,
            powerSync,
            fetchPath: `/api/v1/tasks/${encodeURIComponent(id)}`,
            setters: inbox
              ? [setApiTasks, setApiInboxTasks]
              : [setApiTasks],
          },
        });
        return { ...task, number };
      }

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
        ...(Array.isArray(source.relatedContactIds) &&
        source.relatedContactIds.length > 0
          ? { relatedContactIds: source.relatedContactIds }
          : {}),
        ...(Array.isArray(source.relatedOrganizationIds) &&
        source.relatedOrganizationIds.length > 0
          ? { relatedOrganizationIds: source.relatedOrganizationIds }
          : {}),
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

      let createdProject: ApiProject;

      if (powerSync.ready && powerSync.createMetadata) {
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
        const projectId = crypto.randomUUID().replace(/-/g, "");
        const now = new Date().toISOString();
        const key = uniqueCandidates[0] ?? allocateUniqueProjectKey(source.key, existingKeys);
        createdProject = {
          id: projectId,
          key,
          name: bodyBase.name,
          summary: source.summary ?? null,
          description: source.description ?? null,
          organizationId: bodyBase.organizationId,
          areaId: bodyBase.areaId,
          area: bodyBase.area,
          startDate: bodyBase.startDate,
          dueDate: bodyBase.dueDate,
          icon: bodyBase.icon,
          color: bodyBase.color,
          type: bodyBase.type,
          status: bodyBase.status,
          priority: bodyBase.priority,
          sortOrder: bodyBase.sortOrder,
          createdAt: now,
          updatedAt: now,
        } as ApiProject;
        setApiProjects((rows) => {
          if (!rows) return [createdProject];
          if (rows.some((entry) => entry.id === createdProject.id)) return rows;
          return [createdProject, ...rows];
        });
        try {
          await powerSync.createMetadata(
            "projects",
            toSnakeFields({
              key: createdProject.key,
              name: createdProject.name,
              status: createdProject.status,
              area: bodyBase.area ?? null,
              sortOrder: bodyBase.sortOrder,
              organizationId: createdProject.organizationId ?? null,
              ...(createdProject.type ? { type: createdProject.type } : {}),
            }),
            createdProject.id,
          );
        } catch (error) {
          setApiProjects(
            (rows) =>
              rows?.filter((entry) => entry.id !== createdProject.id) ?? null,
          );
          console.warn("[desktop] local duplicate project create failed", error);
          throw error instanceof Error
            ? error
            : new Error("Could not duplicate project.");
        }
        if (options?.includeTasks && powerSync.connected) {
          try {
            await powerSync.flushCrudUpload();
          } catch (error) {
            console.warn(
              "[desktop] duplicate project upload deferred",
              error instanceof Error ? error.message : error,
            );
          }
        }
      } else {
        const uniqueCandidates = [
          allocateUniqueProjectKey(source.key, rawProjects.map((project) => project.key)),
          ...Array.from({ length: 12 }, (_, index) =>
            allocateUniqueProjectKey(
              `${source.key}${index + 2}`,
              rawProjects.map((project) => project.key),
            ),
          ),
        ];
        const dedupedKeys = [...new Set(uniqueCandidates)];

        let project: ApiProject | null = null;
        let lastError: unknown = null;
        const existingKeys = rawProjects.map((project) => project.key);
        for (const key of dedupedKeys) {
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
        createdProject = project;
        setApiProjects((rows) => {
          if (!rows) return [createdProject];
          if (rows.some((entry) => entry.id === createdProject.id)) return rows;
          return [createdProject, ...rows];
        });
      }

      if (options?.includeTasks) {
        const sourceTasks = [...rawTasks, ...rawInboxTasks]
          .filter((task) => task.projectId === source.id && !task.deletedAt)
          .sort((a, b) => {
            const order = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
            if (order !== 0) return order;
            return (a.number ?? 0) - (b.number ?? 0);
          });

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
