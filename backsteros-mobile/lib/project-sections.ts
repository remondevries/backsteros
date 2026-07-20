/** Mirrors `@backsteros/ui` project-sections. */

export const PROJECT_SECTION_IDS = [
  "overview",
  "tasks",
  "documents",
  "letters",
  "updates",
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTION_IDS)[number];

export const PROJECT_SECTIONS: readonly {
  id: ProjectSectionId;
  label: string;
}[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "documents", label: "Documents" },
  { id: "letters", label: "Letters" },
  { id: "updates", label: "Updates" },
];

export const DEFAULT_PROJECT_SECTION: ProjectSectionId = "overview";

export function getProjectSectionLabel(section: ProjectSectionId): string {
  return (
    PROJECT_SECTIONS.find((entry) => entry.id === section)?.label ?? section
  );
}
