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

export function createDefaultCommandPaletteFilterState(): CommandPaletteFilterState {
  return { mode: "all", searchTerm: "" };
}

export function applyAllModeInputChange(
  value: string,
  current: CommandPaletteFilterState,
): CommandPaletteFilterState | null {
  if (value === current.searchTerm) return null;
  if (value.startsWith("p ")) return { mode: "projects", searchTerm: value.slice(2) };
  if (value.startsWith("t ")) return { mode: "tasks", searchTerm: value.slice(2) };
  if (value.startsWith("d ")) return { mode: "documents", searchTerm: value.slice(2) };
  if (value.startsWith("l ")) return { mode: "letters", searchTerm: value.slice(2) };
  if (value.startsWith("k ")) return { mode: "knowledge", searchTerm: value.slice(2) };
  if (value.startsWith("c ")) return { mode: "contacts", searchTerm: value.slice(2) };
  if (value.startsWith("o ")) {
    return { mode: "organizations", searchTerm: value.slice(2) };
  }
  return { mode: "all", searchTerm: value };
}

export function applyScopedModeInputChange(
  value: string,
  current: CommandPaletteFilterState,
): CommandPaletteFilterState | null {
  if (value === current.searchTerm) return null;
  return { mode: current.mode, searchTerm: value };
}

export function isScopedFilterMode(
  mode: CommandPaletteFilterMode,
): mode is Exclude<CommandPaletteFilterMode, "all"> {
  return mode !== "all";
}

const FILTER_TAB_LETTERS: Record<
  string,
  Exclude<CommandPaletteFilterMode, "all">
> = {
  p: "projects",
  t: "tasks",
  d: "documents",
  l: "letters",
  k: "knowledge",
  c: "contacts",
  o: "organizations",
};

export function resolveFilterModeFromTabInput(
  searchTerm: string,
): Exclude<CommandPaletteFilterMode, "all"> | null {
  const trimmed = searchTerm.trim();
  if (trimmed.length !== 1) return null;
  return FILTER_TAB_LETTERS[trimmed.toLowerCase()] ?? null;
}

export function activateFilterModeFromTab(
  searchTerm: string,
): CommandPaletteFilterState | null {
  const mode = resolveFilterModeFromTabInput(searchTerm);
  if (!mode) return null;
  return { mode, searchTerm: "" };
}

export type GoNavigationItem = {
  id: string;
  label: string;
  hint: string;
  href: string;
  letter: string;
};

export const DEFAULT_GO_NAVIGATION_ITEMS: GoNavigationItem[] = [
  { id: "inbox", letter: "i", hint: "G I", label: "Inbox", href: "/inbox" },
  { id: "journal", letter: "j", hint: "G J", label: "Journal", href: "/journal" },
  {
    id: "knowledge",
    letter: "k",
    hint: "G K",
    label: "Knowledge Base",
    href: "/knowledge",
  },
  { id: "tasks", letter: "t", hint: "G T", label: "Tasks", href: "/tasks" },
  {
    id: "projects",
    letter: "p",
    hint: "G P",
    label: "Projects",
    href: "/projects",
  },
  { id: "letters", letter: "l", hint: "G L", label: "Letters", href: "/letters" },
  {
    id: "contacts",
    letter: "c",
    hint: "G C",
    label: "Contacts",
    href: "/contacts",
  },
  {
    id: "organizations",
    letter: "o",
    hint: "G O",
    label: "Organizations",
    href: "/organizations",
  },
];

export function goNavigationItemSearchValue(item: GoNavigationItem): string {
  return `${item.label} ${item.letter} ${item.href}`;
}

/** Letters shown in the Go-mode placeholder (e.g. "i j k t p l c o"). */
export const NAVIGATION_GO_LETTER_HINT = DEFAULT_GO_NAVIGATION_ITEMS.map(
  (item) => item.letter,
).join(" ");

export type CommandPaletteHit = {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  href: string;
  section: CommandPaletteResultSection;
};
