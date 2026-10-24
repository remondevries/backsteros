import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  deriveLogicalProjectKeyFromSettings,
  type ProjectGroupingSettings,
} from "@t3tools/client-runtime/state/project-grouping";
import {
  findProjectByPath,
  normalizeProjectPathForComparison,
} from "@t3tools/client-runtime/state/projects";
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

function isSameOrNestedPath(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/** Reverse of {@link resolveT3ProjectForBacksterosProject}: match by working directory. */
export function resolveBacksterosProjectForWorkspaceRoot(
  projects: ReadonlyArray<BacksterosCodebaseProject>,
  workspaceRoot: string,
): BacksterosCodebaseProject | null {
  const normalizedCandidate = normalizeProjectPathForComparison(workspaceRoot);
  if (normalizedCandidate.length === 0) return null;

  let best: { readonly project: BacksterosCodebaseProject; readonly cwdLength: number } | null =
    null;
  for (const project of projects) {
    const rawCwd = project.localWorkingDirectory?.trim();
    if (!rawCwd) continue;
    const cwd = normalizeProjectPathForComparison(rawCwd);
    if (cwd.length === 0) continue;
    // Exact match, or Dig workspace nested under the BacksterOS project root
    // (e.g. Codebase/development ↔ Codebase), or the reverse.
    if (
      cwd !== normalizedCandidate &&
      !isSameOrNestedPath(cwd, normalizedCandidate) &&
      !isSameOrNestedPath(normalizedCandidate, cwd)
    ) {
      continue;
    }
    if (!best || cwd.length > best.cwdLength) {
      best = { project, cwdLength: cwd.length };
    }
  }
  return best?.project ?? null;
}

/**
 * Logical settings/project-group key for a BacksterOS working directory.
 * Prefers an explicit key, then settings groups, then a direct T3 project match.
 */
export function resolveLogicalProjectKeyForBacksterosWorkingDirectory(input: {
  readonly workspaceRoot: string | null | undefined;
  readonly explicitProjectKey?: string | null | undefined;
  readonly groups: ReadonlyArray<{
    readonly projectKey: string;
    readonly workspaceRoot: string;
    readonly memberProjects: ReadonlyArray<{ readonly workspaceRoot: string }>;
  }>;
  readonly projects: ReadonlyArray<Project>;
  readonly settings: ProjectGroupingSettings;
}): string | null {
  const explicit = input.explicitProjectKey?.trim();
  if (explicit) return explicit;

  const cwd = input.workspaceRoot?.trim();
  if (!cwd) return null;
  const normalized = normalizeProjectPathForComparison(cwd);
  if (normalized.length === 0) return null;

  for (const group of input.groups) {
    if (normalizeProjectPathForComparison(group.workspaceRoot) === normalized) {
      return group.projectKey;
    }
    for (const member of group.memberProjects) {
      if (normalizeProjectPathForComparison(member.workspaceRoot) === normalized) {
        return group.projectKey;
      }
    }
  }

  const t3Project = findProjectByPath(input.projects, cwd);
  if (!t3Project) return null;
  return deriveLogicalProjectKeyFromSettings(t3Project, input.settings);
}
