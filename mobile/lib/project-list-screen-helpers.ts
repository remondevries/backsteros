import type { Project } from "@backsteros/contracts";

import {
  isProjectArea,
  type ProjectArea,
} from "./project-areas";
import { migrateLegacyProjectType } from "./project-type";

export type ProjectListSyncedRow = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  icon: string | null;
  priority: number | null;
  start_date: string | null;
  due_date: string | null;
  area: string | null;
  area_id?: string | null;
  sort_order: number | null;
};

export type ProjectListRow = {
  id: string;
  key: string | null;
  name: string | null;
  status: string | null;
  type: string | null;
  icon: string | null;
  priority: number | null;
  start_date: string | null;
  due_date: string | null;
  area: ProjectArea | null;
  areaId?: string | null;
  /** Nested-area grouping (`groupProjectsByNestedArea`). */
  sortOrder: number | null;
  /** Status-group sort (`groupProjectsByStatus`). */
  sort_order: number | null;
};

export type ProjectTypeListFilter = "all" | "exclude-codebase" | "codebase-only";

function asProjectArea(value: string | null | undefined): ProjectArea | null {
  return value && isProjectArea(value) ? value : null;
}

export function matchesProjectTypeFilter(
  type: string | null | undefined,
  filter: ProjectTypeListFilter,
): boolean {
  const migrated = migrateLegacyProjectType(type);
  if (filter === "codebase-only") return migrated === "codebase";
  if (filter === "exclude-codebase") return migrated !== "codebase";
  return true;
}

export function mapSyncedProjectRow(
  row: ProjectListSyncedRow,
  filter: ProjectTypeListFilter,
): ProjectListRow | null {
  if (!matchesProjectTypeFilter(row.type, filter)) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    status: row.status,
    type: row.type ?? (filter === "codebase-only" ? "codebase" : "general"),
    icon: row.icon ?? null,
    priority: row.priority ?? 0,
    start_date: row.start_date ?? null,
    due_date: row.due_date ?? null,
    area: asProjectArea(row.area),
    areaId: row.area_id ?? null,
    sortOrder: row.sort_order ?? 0,
    sort_order: row.sort_order ?? 0,
  };
}

export function mapRestProjectRow(
  project: Project,
  filter: ProjectTypeListFilter,
): ProjectListRow | null {
  if (!matchesProjectTypeFilter(project.type, filter)) return null;
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    status: project.status,
    type: project.type ?? (filter === "codebase-only" ? "codebase" : "general"),
    icon: project.icon ?? null,
    priority: project.priority ?? 0,
    start_date: project.startDate ?? null,
    due_date: project.dueDate ?? null,
    area: asProjectArea(project.area),
    areaId: project.areaId ?? null,
    sortOrder: project.sortOrder ?? 0,
    sort_order: project.sortOrder ?? 0,
  };
}
