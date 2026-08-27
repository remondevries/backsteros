import type { GlobalSearchResult } from "@backsteros/contracts";

export type CommandPaletteResultSection =
  | "Projects"
  | "Tasks"
  | "Documents"
  | "Knowledge"
  | "Letters"
  | "Contacts"
  | "Organizations";

export type CommandPaletteHit = {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  href: string;
  section: CommandPaletteResultSection;
};

export const COMMAND_PALETTE_RESULT_SECTIONS: CommandPaletteResultSection[] = [
  "Projects",
  "Tasks",
  "Documents",
  "Knowledge",
  "Letters",
  "Contacts",
  "Organizations",
];

export function sectionForSearchResultType(
  type: string,
  documentKind?: "project" | "knowledge" | "journal" | null,
): CommandPaletteResultSection | null {
  switch (type) {
    case "project":
      return "Projects";
    case "task":
      return "Tasks";
    case "letter":
      return "Letters";
    case "contact":
      return "Contacts";
    case "organization":
      return "Organizations";
    case "document":
      return documentKind === "knowledge" ? "Knowledge" : "Documents";
    default:
      return null;
  }
}

export function hrefForSearchResult(result: GlobalSearchResult): string {
  switch (result.type) {
    case "project":
      return `/project/${result.id}`;
    case "task":
      return `/task/${result.id}`;
    case "organization":
      return `/organization/${encodeURIComponent(result.id)}`;
    case "contact":
      return `/contact/${encodeURIComponent(result.id)}`;
    case "letter":
      return `/letter/${encodeURIComponent(result.id)}`;
    case "document": {
      const path = result.path?.trim() || result.id;
      if (result.documentType === "knowledge") {
        return `/(app)/knowledge/${encodeURIComponent(path)}`;
      }
      if (result.projectId) {
        return `/project/${result.projectId}/file?path=${encodeURIComponent(path)}`;
      }
      return "/(app)/projects";
    }
    default:
      return "/(app)/projects";
  }
}

export function mapGlobalSearchResults(
  results: readonly GlobalSearchResult[],
): CommandPaletteHit[] {
  return results
    .map((result): CommandPaletteHit | null => {
      const section = sectionForSearchResultType(
        result.type,
        result.documentType ?? null,
      );
      if (!section) return null;
      return {
        id: result.id,
        type: result.type,
        title: result.title,
        subtitle: result.snippet,
        href: hrefForSearchResult(result),
        section,
      };
    })
    .filter((hit): hit is CommandPaletteHit => hit != null);
}
