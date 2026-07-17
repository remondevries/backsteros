import type { Project } from "@/lib/db/schema";
import {
  getProjectStatusLabel,
  migrateLegacyProjectStatus,
  PROJECT_STATUS_ORDER,
  type ProjectStatus,
} from "@/lib/project-status";

export type ProjectStatusGroup = {
  status: ProjectStatus;
  label: string;
  projects: Project[];
};

export function groupProjectsByStatus(projects: Project[]): ProjectStatusGroup[] {
  const buckets = new Map<ProjectStatus, Project[]>();

  for (const status of PROJECT_STATUS_ORDER) {
    buckets.set(status, []);
  }

  for (const project of projects) {
    const status = migrateLegacyProjectStatus(project.status);
    buckets.get(status)?.push(project);
  }

  return PROJECT_STATUS_ORDER.map((status) => ({
    status,
    label: getProjectStatusLabel(status),
    projects: (buckets.get(status) ?? []).sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    ),
  }));
}
