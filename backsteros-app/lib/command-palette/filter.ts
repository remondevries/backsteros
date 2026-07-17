import type {
  CommandPaletteFilterMode,
  CommandPaletteFilterState,
} from "./types";

export function createDefaultCommandPaletteFilterState(): CommandPaletteFilterState {
  return { mode: "all", searchTerm: "" };
}

export function applyAllModeInputChange(
  value: string,
  current: CommandPaletteFilterState,
): CommandPaletteFilterState | null {
  if (value === current.searchTerm) {
    return null;
  }

  if (value.startsWith("p ")) {
    return { mode: "projects", searchTerm: value.slice(2) };
  }

  if (value.startsWith("t ")) {
    return { mode: "tasks", searchTerm: value.slice(2) };
  }

  if (value.startsWith("d ")) {
    return { mode: "documents", searchTerm: value.slice(2) };
  }

  if (value.startsWith("l ")) {
    return { mode: "letters", searchTerm: value.slice(2) };
  }

  if (value.startsWith("k ")) {
    return { mode: "knowledge", searchTerm: value.slice(2) };
  }

  if (value.startsWith("c ")) {
    return { mode: "contacts", searchTerm: value.slice(2) };
  }

  if (value.startsWith("o ")) {
    return { mode: "organizations", searchTerm: value.slice(2) };
  }

  return { mode: "all", searchTerm: value };
}

export function applyScopedModeInputChange(
  value: string,
  current: CommandPaletteFilterState,
): CommandPaletteFilterState | null {
  if (value === current.searchTerm) {
    return null;
  }

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
  if (trimmed.length !== 1) {
    return null;
  }

  return FILTER_TAB_LETTERS[trimmed.toLowerCase()] ?? null;
}

export function activateFilterModeFromTab(
  searchTerm: string,
): CommandPaletteFilterState | null {
  const mode = resolveFilterModeFromTabInput(searchTerm);
  if (!mode) {
    return null;
  }

  return { mode, searchTerm: "" };
}
