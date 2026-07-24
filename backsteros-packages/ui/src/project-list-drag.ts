import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "./project-status.js";

export type ProjectReorderRequest = {
  projectId: string;
  fromStatus: ProjectStatus;
  toStatus: ProjectStatus;
  beforeProjectId: string | null;
};

export type ProjectDragPayload = {
  projectId: string;
  status: ProjectStatus;
};

export type ProjectLikeForDrag = {
  id: string;
  status: string;
};

export const PROJECT_LIST_DRAG_TYPE = "application/x-backsteros-project-item";

/** Fallback — custom MIME types are often invisible during dragover in WKWebView/Tauri. */
export const PROJECT_LIST_DRAG_FALLBACK_TYPE = "text/plain";

export function projectOrderKey(projectId: string): string {
  return `project:${projectId}`;
}

export function projectGroupAppendOrderKey(status: ProjectStatus): string {
  return `project-group:${status}:append`;
}

export function createProjectDragPayload(project: ProjectLikeForDrag): string {
  const payload: ProjectDragPayload = {
    projectId: project.id,
    status: migrateLegacyProjectStatus(project.status),
  };

  return JSON.stringify(payload);
}

function parseProjectDragPayload(rawPayload: string): ProjectDragPayload | null {
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

export function readProjectDragPayload(
  dataTransfer: DataTransfer,
): ProjectDragPayload | null {
  const custom = dataTransfer.getData(PROJECT_LIST_DRAG_TYPE);
  if (custom) return parseProjectDragPayload(custom);
  const fallback = dataTransfer.getData(PROJECT_LIST_DRAG_FALLBACK_TYPE);
  if (fallback) return parseProjectDragPayload(fallback);
  return null;
}

export function writeProjectDragPayload(
  dataTransfer: DataTransfer,
  project: ProjectLikeForDrag,
): void {
  const payload = createProjectDragPayload(project);
  dataTransfer.setData(PROJECT_LIST_DRAG_TYPE, payload);
  dataTransfer.setData(PROJECT_LIST_DRAG_FALLBACK_TYPE, payload);
}

export function isProjectListDragActive(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes(PROJECT_LIST_DRAG_TYPE) ||
    types.includes(PROJECT_LIST_DRAG_FALLBACK_TYPE)
  );
}

export function resolveProjectDropBeforeProject(input: {
  payload: ProjectDragPayload;
  targetProject: ProjectLikeForDrag;
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
