import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { findProjectByPath } from "@t3tools/client-runtime/state/projects";
import type { ScopedProjectRef } from "@t3tools/contracts";

import type { Project } from "~/types";
import type { BacksterosCodebaseProject } from "./types";

export function resolveT3ProjectForBacksterosProject(
  projects: ReadonlyArray<Project>,
  backsterosProject: BacksterosCodebaseProject,
): Project | null {
  const cwd = backsterosProject.localWorkingDirectory?.trim();
  if (!cwd) return null;
  return findProjectByPath(projects, cwd) ?? null;
}

export function resolveT3ProjectRefForBacksterosProject(
  projects: ReadonlyArray<Project>,
  backsterosProject: BacksterosCodebaseProject,
): ScopedProjectRef | null {
  const project = resolveT3ProjectForBacksterosProject(projects, backsterosProject);
  if (!project) return null;
  return scopeProjectRef(project.environmentId, project.id);
}
