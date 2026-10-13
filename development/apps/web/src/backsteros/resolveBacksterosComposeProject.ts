import type { BacksterosCodebaseProject } from "./types";

/**
 * Pick the project used to open the create-task compose modal.
 * Prefers the open task / route, then remembered rail context, then the first
 * loaded project so the modal (which has its own project picker) can open from
 * Inbox or the projects list without forcing a prior selection.
 */
export function resolveBacksterosComposeProject(input: {
  readonly selectedProject?: BacksterosCodebaseProject | null;
  readonly routeProjectId?: string | null;
  readonly rememberedProjectIds?: readonly (string | null | undefined)[];
  readonly projects?: readonly BacksterosCodebaseProject[] | null;
}): BacksterosCodebaseProject | null {
  const projects = input.projects ?? [];
  const selected = input.selectedProject ?? null;
  if (selected) {
    return projects.find((project) => project.id === selected.id) ?? selected;
  }

  const candidateIds: string[] = [];
  if (typeof input.routeProjectId === "string" && input.routeProjectId.trim()) {
    candidateIds.push(input.routeProjectId);
  }
  for (const id of input.rememberedProjectIds ?? []) {
    if (typeof id === "string" && id.trim() && !candidateIds.includes(id)) {
      candidateIds.push(id);
    }
  }

  for (const id of candidateIds) {
    const found = projects.find((project) => project.id === id);
    if (found) return found;
  }

  return projects[0] ?? null;
}
