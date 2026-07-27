import {
  PROJECT_AREA_LABELS,
  PROJECT_AREA_ORDER,
  type ProjectArea,
} from "./project-areas.js";

export type ProjectAreaGroupKey = ProjectArea | "none";

export type NestedAreaRef = {
  id: string;
  name: string;
  parent: ProjectArea | null;
  sortOrder?: number;
};

export type ProjectLikeForAreaGrouping = {
  area: ProjectArea | null;
  areaId?: string | null;
  sortOrder?: number;
};

export type NestedAreaGroup<
  T extends ProjectLikeForAreaGrouping = ProjectLikeForAreaGrouping,
> = {
  areaId: string;
  name: string;
  projects: T[];
};

export type ProjectAreaGroup<
  T extends ProjectLikeForAreaGrouping = ProjectLikeForAreaGrouping,
> = {
  area: ProjectAreaGroupKey;
  label: string;
  /** False for the synthetic “No area” bucket — no nested create. */
  canCreate: boolean;
  /** Custom areas under this parent. */
  nestedAreas: NestedAreaGroup<T>[];
  /** Projects in this parent without a matching nested area. */
  projects: T[];
};

export type GroupProjectsByAreaOptions = {
  /** When true, keep empty Personal/Business/Clients groups. */
  includeEmpty?: boolean;
};

export type NestedAreaBucket<
  T extends ProjectLikeForAreaGrouping = ProjectLikeForAreaGrouping,
> = {
  /** Nested area id, or `null` for projects without a matching sub-area. */
  areaId: string | null;
  name: string | null;
  /** False for the ungrouped bucket — render without a sub-area header. */
  showHeader: boolean;
  projects: T[];
};

export function projectNestedAreaCollapseKey(
  status: string,
  type: string,
  areaId: string,
): string {
  return `${status}:${type}:area:${areaId}`;
}

/**
 * Split a flat project list by nested custom area (`areaId`).
 * Only areas that appear in `nestedAreas` and have matching projects get a
 * header. Projects without a matching `areaId` stay in an ungrouped bucket
 * (`showHeader: false`). Ungrouped first, then nested areas by sort order —
 * so ungrouped rows are not mistaken for members of the last subgroup.
 */
export function groupProjectsByNestedArea<T extends ProjectLikeForAreaGrouping>(
  projects: readonly T[],
  nestedAreas: readonly NestedAreaRef[] = [],
): NestedAreaBucket<T>[] {
  if (projects.length === 0) return [];

  const orderedAreas = sortByOrder([...nestedAreas]);
  const nestedIds = new Set(orderedAreas.map((area) => area.id));

  const buckets: NestedAreaBucket<T>[] = [];

  const ungrouped = projects.filter((project) => {
    if (!project.areaId) return true;
    return !nestedIds.has(project.areaId);
  });
  if (ungrouped.length > 0) {
    buckets.push({
      areaId: null,
      name: null,
      showHeader: false,
      projects: ungrouped,
    });
  }

  for (const area of orderedAreas) {
    const matched = projects.filter((project) => project.areaId === area.id);
    if (matched.length === 0) continue;
    buckets.push({
      areaId: area.id,
      name: area.name,
      showHeader: true,
      projects: matched,
    });
  }

  return buckets;
}

export function getProjectAreaGroupLabel(area: ProjectAreaGroupKey): string {
  if (area === "none") return "No area";
  return PROJECT_AREA_LABELS[area];
}

export function projectAreaGroupKey(
  area: ProjectArea | null | undefined,
): ProjectAreaGroupKey {
  return area ?? "none";
}

function sortByOrder<T extends { sortOrder?: number }>(items: T[]): T[] {
  return [...items].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
}

/**
 * Group projects by top-level area (Personal / Business / Clients), with optional
 * nested custom areas under each parent.
 */
export function groupProjectsByArea<T extends ProjectLikeForAreaGrouping>(
  projects: readonly T[],
  nestedAreas: readonly NestedAreaRef[] = [],
  options?: GroupProjectsByAreaOptions,
): ProjectAreaGroup<T>[] {
  const nestedByParent = new Map<ProjectArea, NestedAreaRef[]>();
  for (const parent of PROJECT_AREA_ORDER) {
    nestedByParent.set(parent, []);
  }
  for (const area of nestedAreas) {
    if (!area.parent) continue;
    nestedByParent.get(area.parent)?.push(area);
  }
  for (const parent of PROJECT_AREA_ORDER) {
    nestedByParent.set(parent, sortByOrder(nestedByParent.get(parent) ?? []));
  }

  const nestedIds = new Set(nestedAreas.map((area) => area.id));

  const namedGroups: ProjectAreaGroup<T>[] = PROJECT_AREA_ORDER.map(
    (parent) => {
      const parentNested = nestedByParent.get(parent) ?? [];
      const nestedGroups: NestedAreaGroup<T>[] = parentNested.map((area) => ({
        areaId: area.id,
        name: area.name,
        projects: sortByOrder(
          projects.filter((project) => project.areaId === area.id),
        ),
      }));

      const ungrouped = sortByOrder(
        projects.filter((project) => {
          if (project.area !== parent) return false;
          if (!project.areaId) return true;
          return !nestedIds.has(project.areaId);
        }),
      );

      return {
        area: parent,
        label: PROJECT_AREA_LABELS[parent],
        canCreate: true,
        nestedAreas: nestedGroups,
        projects: ungrouped,
      };
    },
  );

  const noneProjects = sortByOrder(
    projects.filter((project) => project.area == null),
  );
  const noneGroup: ProjectAreaGroup<T> = {
    area: "none",
    label: "No area",
    canCreate: false,
    nestedAreas: [],
    projects: noneProjects,
  };

  const includeEmpty = Boolean(options?.includeEmpty);
  return [
    ...namedGroups.filter(
      (group) =>
        includeEmpty ||
        group.projects.length > 0 ||
        group.nestedAreas.length > 0,
    ),
    ...(noneProjects.length > 0 ? [noneGroup] : []),
  ];
}
