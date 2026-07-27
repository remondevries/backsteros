export const PROJECT_SECTION_IDS = [
  "overview",
  "tasks",
  "documents",
  "letters",
  "updates",
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTION_IDS)[number];

export type ProjectSectionConfig = {
  id: ProjectSectionId;
  label: string;
};

export const PROJECT_SECTIONS: readonly ProjectSectionConfig[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "documents", label: "Documents" },
  { id: "letters", label: "Letters" },
  { id: "updates", label: "Updates" },
];

export function isProjectSectionId(value: string): value is ProjectSectionId {
  return (PROJECT_SECTION_IDS as readonly string[]).includes(value);
}

/** Parse a URL segment (`tasks`, `letters`, …). Empty / missing → overview. */
export function parseProjectSectionId(
  value: string | null | undefined,
): ProjectSectionId {
  if (!value || value === "overview") return "overview";
  return isProjectSectionId(value) ? value : "overview";
}

/** Path after `/projects/{key}` — empty for overview. */
export function getProjectSectionSegment(section: ProjectSectionId): string {
  return section === "overview" ? "" : section;
}

export function getProjectSectionHref(
  projectKey: string,
  section: ProjectSectionId = "overview",
): string {
  const base = `/projects/${encodeURIComponent(projectKey)}`;
  const segment = getProjectSectionSegment(section);
  return segment ? `${base}/${segment}` : base;
}

/** Active project section from a standalone or org-scoped project pathname. */
export function getActiveProjectSection(
  pathname: string,
  projectRouteParam: string,
): ProjectSectionId {
  const target = projectRouteParam.toLowerCase();
  const org = pathname.match(/^(\/organizations\/[^/]+\/projects\/([^/]+))/);
  const stand = pathname.match(/^(\/projects\/([^/]+))/);
  const match = org ?? stand;
  if (!match) return "overview";

  const routeParam = decodeURIComponent(match[2]!);
  if (routeParam.toLowerCase() !== target) return "overview";

  const base = match[1]!;
  for (const section of PROJECT_SECTIONS) {
    const segment = getProjectSectionSegment(section.id);
    if (!segment) continue;
    const sectionPath = `${base}/${segment}`;
    if (pathname === sectionPath || pathname.startsWith(`${sectionPath}/`)) {
      return section.id;
    }
  }

  return "overview";
}

export function getProjectDocumentHref(
  projectKey: string,
  pathOrId: string,
): string {
  // Preserve path separators (Next parity) — encode each segment separately.
  const encoded = pathOrId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${getProjectSectionHref(projectKey, "documents")}/${encoded}`;
}

export function getProjectLetterHref(
  projectKey: string,
  letterNumberOrNew: number | "new",
): string {
  const base = getProjectSectionHref(projectKey, "letters");
  if (letterNumberOrNew === "new") {
    return `${base}/new`;
  }
  return `${base}/l-${letterNumberOrNew}`;
}
