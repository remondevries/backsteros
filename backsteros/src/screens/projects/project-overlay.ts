import { useMemo } from "react";
import type { ProjectOverviewRowProject } from "@backsteros/ui";

export type WorkspaceProject = ProjectOverviewRowProject & {
  organizationId?: string | null;
  type?: string;
  localWorkingDirectory?: string | null;
  developmentLocation?: string | null;
  productionLocation?: string | null;
  localLocation?: string | null;
  developmentSetupStatus?: "pending" | "ready" | "failed" | null;
  developmentSetupError?: string | null;
  githubRepository?: string | null;
  provider?: string | null;
  category?: string | null;
  healthCheckMode?: "simple" | "advanced" | null;
  healthCheckDomain?: string | null;
  channel?: {
    uri: string;
    name?: string | null;
  } | null;
};

/** Optimistic per-project patches applied before sync confirms them. */
export type ProjectOverlay = Record<string, Partial<WorkspaceProject>>;

/** Workspace projects with optimistic overlay patches merged in. */
export function useProjectsWithOverlay<T extends { id: string }>(
  projects: readonly T[],
  overlay: ProjectOverlay,
): T[] {
  return useMemo(
    () =>
      projects.map((project) => ({
        ...project,
        ...overlay[project.id],
      })),
    [overlay, projects],
  );
}
