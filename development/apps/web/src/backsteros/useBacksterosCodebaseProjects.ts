import { useCallback } from "react";

import { backsterosEntityListFingerprint } from "./backsterosEntityFingerprint";
import { createBacksterosSharedQuery, useBacksterosSharedQuery } from "./backsterosQueryStore";
import { fetchBacksterosCodebaseProjects } from "./client";
import { applyProjectSortOrderPatches, type BacksterosProjectSortPatch } from "./project-reorder";
import type { BacksterosCodebaseProject } from "./types";

export type BacksterosCodebaseProjectsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly projects: readonly BacksterosCodebaseProject[] }
  | { readonly status: "error"; readonly message: string };

const projectsQuery = createBacksterosSharedQuery({
  fetch: fetchBacksterosCodebaseProjects,
  fingerprint: backsterosEntityListFingerprint,
  errorMessage: "Failed to load BacksterOS projects",
});

function toProjectsState(
  snapshot: ReturnType<typeof projectsQuery.getSnapshot>,
): BacksterosCodebaseProjectsState {
  if (snapshot.status === "ready") {
    return { status: "ready", projects: snapshot.data };
  }
  return snapshot;
}

export function useBacksterosCodebaseProjects(enabled: boolean): {
  readonly state: BacksterosCodebaseProjectsState;
  readonly reload: () => void;
  readonly applySortOrderPatches: (patches: readonly BacksterosProjectSortPatch[]) => void;
  readonly patchLocalProject: (
    projectId: string,
    patch: Partial<BacksterosCodebaseProject>,
  ) => void;
} {
  const snapshot = useBacksterosSharedQuery(projectsQuery, enabled);
  const reload = useCallback(() => projectsQuery.reload(), []);
  const applySortOrderPatches = useCallback((patches: readonly BacksterosProjectSortPatch[]) => {
    if (patches.length === 0) return;
    projectsQuery.patchReadyData((projects) => applyProjectSortOrderPatches(projects, patches));
  }, []);
  const patchLocalProject = useCallback(
    (projectId: string, patch: Partial<BacksterosCodebaseProject>) => {
      projectsQuery.patchReadyData((projects) =>
        projects.map((project) => (project.id === projectId ? { ...project, ...patch } : project)),
      );
    },
    [],
  );

  return {
    state: toProjectsState(snapshot),
    reload,
    applySortOrderPatches,
    patchLocalProject,
  };
}

/** Test helper — shared projects query internals. */
export function getBacksterosCodebaseProjectsQueryDebugStats() {
  return projectsQuery.getDebugStats();
}
