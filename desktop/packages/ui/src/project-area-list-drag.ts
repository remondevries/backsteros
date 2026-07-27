import type { ProjectArea } from "./project-areas.js";
import {
  projectAreaGroupKey,
  type ProjectAreaGroupKey,
} from "./group-projects-by-area.js";

export type ProjectAreaReorderRequest = {
  projectId: string;
  fromArea: ProjectAreaGroupKey;
  toArea: ProjectAreaGroupKey;
  beforeProjectId: string | null;
};

export type ProjectAreaDragPayload = {
  projectId: string;
  area: ProjectAreaGroupKey;
};

export type ProjectLikeForAreaDrag = {
  id: string;
  area: ProjectArea | null;
};

export const PROJECT_AREA_LIST_DRAG_TYPE =
  "application/x-backsteros-project-area-item";

/** Fallback — custom MIME types are often invisible during dragover in WKWebView/Tauri. */
export const PROJECT_AREA_LIST_DRAG_FALLBACK_TYPE = "text/plain";

export function projectAreaOrderKey(projectId: string): string {
  return `project-area:${projectId}`;
}

export function projectAreaGroupAppendOrderKey(
  area: ProjectAreaGroupKey,
): string {
  return `project-area-group:${area}:append`;
}

export function createProjectAreaDragPayload(
  project: ProjectLikeForAreaDrag,
): string {
  const payload: ProjectAreaDragPayload = {
    projectId: project.id,
    area: projectAreaGroupKey(project.area),
  };
  return JSON.stringify(payload);
}

function parseProjectAreaDragPayload(
  rawPayload: string,
): ProjectAreaDragPayload | null {
  try {
    const payload = JSON.parse(rawPayload) as Partial<ProjectAreaDragPayload>;
    if (
      typeof payload.projectId !== "string" ||
      typeof payload.area !== "string"
    ) {
      return null;
    }
    const area = payload.area;
    if (
      area !== "personal" &&
      area !== "business" &&
      area !== "clients" &&
      area !== "none"
    ) {
      return null;
    }
    return { projectId: payload.projectId, area };
  } catch {
    return null;
  }
}

export function readProjectAreaDragPayload(
  dataTransfer: DataTransfer,
): ProjectAreaDragPayload | null {
  const custom = dataTransfer.getData(PROJECT_AREA_LIST_DRAG_TYPE);
  if (custom) return parseProjectAreaDragPayload(custom);
  const fallback = dataTransfer.getData(PROJECT_AREA_LIST_DRAG_FALLBACK_TYPE);
  if (fallback) return parseProjectAreaDragPayload(fallback);
  return null;
}

export function writeProjectAreaDragPayload(
  dataTransfer: DataTransfer,
  project: ProjectLikeForAreaDrag,
): void {
  const payload = createProjectAreaDragPayload(project);
  dataTransfer.setData(PROJECT_AREA_LIST_DRAG_TYPE, payload);
  dataTransfer.setData(PROJECT_AREA_LIST_DRAG_FALLBACK_TYPE, payload);
}

export function isProjectAreaListDragActive(
  dataTransfer: DataTransfer,
): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes(PROJECT_AREA_LIST_DRAG_TYPE) ||
    types.includes(PROJECT_AREA_LIST_DRAG_FALLBACK_TYPE)
  );
}

export function resolveProjectAreaDropBeforeProject(input: {
  payload: ProjectAreaDragPayload;
  targetProject: ProjectLikeForAreaDrag;
}): ProjectAreaReorderRequest | null {
  const { payload, targetProject } = input;
  if (payload.projectId === targetProject.id) return null;

  return {
    projectId: payload.projectId,
    fromArea: payload.area,
    toArea: projectAreaGroupKey(targetProject.area),
    beforeProjectId: targetProject.id,
  };
}

export function resolveProjectAreaDropOnGroupAppend(input: {
  payload: ProjectAreaDragPayload;
  area: ProjectAreaGroupKey;
}): ProjectAreaReorderRequest {
  return {
    projectId: input.payload.projectId,
    fromArea: input.payload.area,
    toArea: input.area,
    beforeProjectId: null,
  };
}
