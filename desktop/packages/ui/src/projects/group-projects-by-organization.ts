export type OrganizationRef = {
  id: string;
  name: string;
  sortOrder?: number;
};

export type ProjectLikeForOrganizationGrouping = {
  organizationId?: string | null;
  sortOrder?: number;
};

export type OrganizationBucket<
  T extends ProjectLikeForOrganizationGrouping =
    ProjectLikeForOrganizationGrouping,
> = {
  /** Organization id, or `null` for projects without a matching organization. */
  organizationId: string | null;
  name: string | null;
  /** False for the ungrouped bucket — render without an organization header. */
  showHeader: boolean;
  projects: T[];
};

export function projectOrganizationCollapseKey(
  status: string,
  type: string,
  organizationId: string,
): string {
  return `${status}:${type}:org:${organizationId}`;
}

function sortOrgs(items: OrganizationRef[]): OrganizationRef[] {
  return [...items].sort((left, right) => {
    const orderDiff = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return left.name.localeCompare(right.name);
  });
}

/**
 * Split a flat project list by `organizationId`.
 * Only organizations that appear in `organizations` and have matching projects
 * get a header. Projects without a matching org stay in an ungrouped bucket
 * (`showHeader: false`). Ungrouped first, then orgs by sortOrder then name —
 * so ungrouped rows are not mistaken for members of the last subgroup.
 */
export function groupProjectsByOrganization<
  T extends ProjectLikeForOrganizationGrouping,
>(
  projects: readonly T[],
  organizations: readonly OrganizationRef[] = [],
): OrganizationBucket<T>[] {
  if (projects.length === 0) return [];

  const orderedOrgs = sortOrgs([...organizations]);
  const orgIds = new Set(orderedOrgs.map((org) => org.id));

  const buckets: OrganizationBucket<T>[] = [];

  const ungrouped = projects.filter((project) => {
    if (!project.organizationId) return true;
    return !orgIds.has(project.organizationId);
  });
  if (ungrouped.length > 0) {
    buckets.push({
      organizationId: null,
      name: null,
      showHeader: false,
      projects: ungrouped,
    });
  }

  for (const org of orderedOrgs) {
    const matched = projects.filter(
      (project) => project.organizationId === org.id,
    );
    if (matched.length === 0) continue;
    buckets.push({
      organizationId: org.id,
      name: org.name,
      showHeader: true,
      projects: matched,
    });
  }

  return buckets;
}
