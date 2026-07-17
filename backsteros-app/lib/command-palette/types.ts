export type CommandPaletteFilterMode =
  | "all"
  | "projects"
  | "tasks"
  | "documents"
  | "letters"
  | "knowledge"
  | "contacts"
  | "organizations";

export type CommandPaletteFilterState = {
  mode: CommandPaletteFilterMode;
  searchTerm: string;
};

export type CommandPaletteResultSection =
  | "Projects"
  | "Tasks"
  | "Documents"
  | "Knowledge"
  | "Letters"
  | "Contacts"
  | "Organizations";

export const COMMAND_PALETTE_RESULT_SECTIONS: CommandPaletteResultSection[] = [
  "Projects",
  "Tasks",
  "Documents",
  "Knowledge",
  "Letters",
  "Contacts",
  "Organizations",
];

export function commandPaletteSectionsForMode(
  mode: CommandPaletteFilterMode,
): CommandPaletteResultSection[] {
  switch (mode) {
    case "projects":
      return ["Projects"];
    case "tasks":
      return ["Tasks"];
    case "documents":
      return ["Documents"];
    case "letters":
      return ["Letters"];
    case "knowledge":
      return ["Knowledge"];
    case "contacts":
      return ["Contacts"];
    case "organizations":
      return ["Organizations"];
    default:
      return COMMAND_PALETTE_RESULT_SECTIONS;
  }
}

/** Map GlobalSearchResult.type (+ knowledge documents) to a result section. */
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
