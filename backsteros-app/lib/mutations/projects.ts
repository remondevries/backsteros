"use client";

import type { Project as ApiProject } from "@backsteros/contracts";

import { createId } from "@/lib/create-id";
import { dueDateToIso } from "@/lib/entity-normalize";
import type { ProjectArea } from "@/lib/project-areas";
import { isProjectArea } from "@/lib/project-areas";
import { normalizeProjectKey } from "@/lib/project-key";
import { isProjectStatus, type ProjectStatus } from "@/lib/project-status";
import { isTaskPriority, type TaskPriority } from "@/lib/task-priority";

import {
  apiErrorText,
  getMutationContext,
  patchProjectLocal,
  toLocalFields,
} from "./client";

export type CreateProjectResult =
  | { ok: true; projectId: string; projectKey: string }
  | { ok: false; error: string };

export type UpdateProjectDescriptionResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectSummaryResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectKeyResult =
  | { ok: true; projectKey: string }
  | { ok: false; error: string };

export type UpdateProjectNameResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectIconResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectPriorityResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectStartDateResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectDueDateResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectAreaResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProjectOrganizationResult =
  | { ok: true }
  | { ok: false; error: string };

export type ReorderProjectResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteProjectResult =
  | { ok: true; redirectHref: string }
  | { ok: false; error: string };

function projectKeyFromName(name: string) {
  const base = normalizeProjectKey(name).slice(0, 6) || "PRJ";
  return `${base}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 8);
}

async function patchProject(
  projectId: string,
  body: Record<string, unknown>,
): Promise<ApiProject> {
  const { client, sync, refresh } = getMutationContext();
  await patchProjectLocal(sync, projectId, body);
  const project = await client.requestJson<ApiProject>(
    `/api/v1/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  refresh();
  return project;
}

export async function createProjectAction(input: {
  name: string;
  status?: ProjectStatus;
}): Promise<CreateProjectResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Project name is required." };
  const status =
    input.status && isProjectStatus(input.status) ? input.status : "backlog";
  const key = projectKeyFromName(name);
  const body = {
    key,
    name,
    status,
    sortOrder: -Date.now(),
  };

  try {
    const { client, sync, refresh } = getMutationContext();
    if (sync?.ready) {
      const projectId = await sync.createMetadata(
        "projects",
        toLocalFields(body),
      );
      refresh();
      return { ok: true, projectId, projectKey: key };
    }
    const project = await client.requestJson<ApiProject>("/api/v1/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
    return { ok: true, projectId: project.id, projectKey: project.key };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectDescriptionAction(input: {
  projectId: string;
  description: string;
}): Promise<UpdateProjectDescriptionResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    await patchProject(input.projectId, {
      description: input.description.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectSummaryAction(input: {
  projectId: string;
  summary: string;
}): Promise<UpdateProjectSummaryResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    await patchProject(input.projectId, {
      summary: input.summary.trim() || null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectKeyAction(input: {
  projectId: string;
  key: string;
}): Promise<UpdateProjectKeyResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  const key = normalizeProjectKey(input.key);
  if (key.length < 2 || key.length > 6) {
    return { ok: false, error: "Project ID must be 2–6 letters or numbers." };
  }
  try {
    const project = await patchProject(input.projectId, { key });
    return { ok: true, projectKey: project.key };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectNameAction(input: {
  projectId: string;
  name: string;
}): Promise<UpdateProjectNameResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Project name is required." };
  try {
    await patchProject(input.projectId, { name });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectStatusAction(input: {
  projectId: string;
  status: ProjectStatus;
}): Promise<UpdateProjectStatusResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  if (!isProjectStatus(input.status)) return { ok: false, error: "Invalid status." };
  try {
    await patchProject(input.projectId, { status: input.status });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectIconAction(input: {
  projectId: string;
  icon: string | null;
}): Promise<UpdateProjectIconResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    await patchProject(input.projectId, { icon: input.icon });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectPriorityAction(input: {
  projectId: string;
  priority: TaskPriority;
}): Promise<UpdateProjectPriorityResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  if (!isTaskPriority(input.priority)) {
    return { ok: false, error: "Invalid priority." };
  }
  try {
    await patchProject(input.projectId, { priority: input.priority });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectStartDateAction(input: {
  projectId: string;
  startDate: string | null;
}): Promise<UpdateProjectStartDateResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    await patchProject(input.projectId, {
      startDate: dueDateToIso(input.startDate),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectDueDateAction(input: {
  projectId: string;
  dueDate: string | null;
}): Promise<UpdateProjectDueDateResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    await patchProject(input.projectId, { dueDate: dueDateToIso(input.dueDate) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectAreaAction(input: {
  projectId: string;
  area: ProjectArea | null;
}): Promise<UpdateProjectAreaResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  if (input.area != null && !isProjectArea(input.area)) {
    return { ok: false, error: "Invalid area." };
  }
  try {
    await patchProject(input.projectId, { area: input.area });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function updateProjectOrganizationAction(input: {
  projectId: string;
  organizationId: string | null;
}): Promise<UpdateProjectOrganizationResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    await patchProject(input.projectId, {
      organizationId: input.organizationId,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

/**
 * No dedicated projects/reorder endpoint — apply status + sortOrder patches.
 */
export async function reorderProjectAction(input: {
  projectId: string;
  toStatus: ProjectStatus;
  beforeProjectId?: string | null;
}): Promise<ReorderProjectResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  if (!isProjectStatus(input.toStatus)) {
    return { ok: false, error: "Invalid status." };
  }
  if (input.beforeProjectId === input.projectId) {
    return { ok: false, error: "Invalid drop target." };
  }

  try {
    const { client, sync, refresh } = getMutationContext();
    const { projects } = await client.requestJson<{ projects: ApiProject[] }>(
      "/api/v1/projects",
    );
    const moving = projects.find((project) => project.id === input.projectId);
    if (!moving) return { ok: false, error: "Project not found." };

    const without = projects.filter((project) => project.id !== input.projectId);
    const targetGroup = without
      .filter((project) => project.status === input.toStatus)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let nextGroup: ApiProject[];
    const beforeProjectId = input.beforeProjectId ?? null;
    if (!beforeProjectId) {
      nextGroup = [...targetGroup, { ...moving, status: input.toStatus }];
    } else {
      const insertIndex = targetGroup.findIndex(
        (project) => project.id === beforeProjectId,
      );
      if (insertIndex === -1) {
        nextGroup = [...targetGroup, { ...moving, status: input.toStatus }];
      } else {
        nextGroup = [
          ...targetGroup.slice(0, insertIndex),
          { ...moving, status: input.toStatus },
          ...targetGroup.slice(insertIndex),
        ];
      }
    }

    await Promise.all(
      nextGroup.map(async (project, index) => {
        const body = { status: project.status, sortOrder: index * 10 };
        await patchProjectLocal(sync, project.id, body);
        await client.requestJson(
          `/api/v1/projects/${encodeURIComponent(project.id)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
      }),
    );

    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export async function deleteProjectAction(input: {
  projectId: string;
  pathname?: string;
}): Promise<DeleteProjectResult> {
  if (!input.projectId.trim()) return { ok: false, error: "Project is required." };
  try {
    const { client, sync, refresh } = getMutationContext();
    await patchProjectLocal(sync, input.projectId, {
      deletedAt: new Date().toISOString(),
    });
    await client.requestJson(
      `/api/v1/projects/${encodeURIComponent(input.projectId)}`,
      { method: "DELETE" },
    );
    refresh();
    return { ok: true, redirectHref: input.pathname?.trim() || "/projects" };
  } catch (error) {
    return { ok: false, error: apiErrorText(error) };
  }
}

export function newClientProjectId() {
  return createId();
}
