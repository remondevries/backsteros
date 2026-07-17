import type { Project } from "@/lib/db/schema";
import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "@/lib/project-status";
import type { ProjectReorderRequest } from "@/lib/projects/project-reorder-client";

export type ProjectDragPayload = {
  projectId: string;
  status: ProjectStatus;
};

export const PROJECT_LIST_DRAG_TYPE = "application/x-circle-project-item";

export function projectOrderKey(projectId: string): string {
  return `project:${projectId}`;
}

export function projectGroupAppendOrderKey(status: ProjectStatus): string {
  return `project-group:${status}:append`;
}

export function createProjectDragPayload(project: Project): string {
  const payload: ProjectDragPayload = {
    projectId: project.id,
    status: migrateLegacyProjectStatus(project.status),
  };

  return JSON.stringify(payload);
}

export function readProjectDragPayload(
  dataTransfer: DataTransfer,
): ProjectDragPayload | null {
  const rawPayload = dataTransfer.getData(PROJECT_LIST_DRAG_TYPE);
  if (!rawPayload) return null;

  try {
    const payload = JSON.parse(rawPayload) as Partial<ProjectDragPayload>;
    if (
      typeof payload.projectId !== "string" ||
      typeof payload.status !== "string"
    ) {
      return null;
    }

    return {
      projectId: payload.projectId,
      status: migrateLegacyProjectStatus(payload.status),
    };
  } catch {
    return null;
  }
}

export function isProjectListDragActive(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(PROJECT_LIST_DRAG_TYPE);
}

export function resolveProjectDropBeforeProject(input: {
  payload: ProjectDragPayload;
  targetProject: Project;
}): ProjectReorderRequest | null {
  const { payload, targetProject } = input;
  if (payload.projectId === targetProject.id) return null;

  return {
    projectId: payload.projectId,
    fromStatus: payload.status,
    toStatus: migrateLegacyProjectStatus(targetProject.status),
    beforeProjectId: targetProject.id,
  };
}

export function resolveProjectDropOnGroupAppend(input: {
  payload: ProjectDragPayload;
  status: ProjectStatus;
}): ProjectReorderRequest {
  return {
    projectId: input.payload.projectId,
    fromStatus: input.payload.status,
    toStatus: input.status,
    beforeProjectId: null,
  };
}
