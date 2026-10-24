/** Mirrors `@backsteros/ui` `CODEBASE_LIST_TAB_OPTIONS`, plus T3 project settings. */
export const BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS = [
  { value: "overview" as const, label: "Overview" },
  { value: "tasks" as const, label: "Tasks" },
  { value: "files" as const, label: "Files" },
  { value: "docs" as const, label: "Documents" },
  { value: "commits" as const, label: "Commits" },
  { value: "pulls" as const, label: "PRs" },
  { value: "updates" as const, label: "Updates" },
  { value: "settings" as const, label: "Settings" },
] as const;

export type BacksterosCodebaseListTab =
  (typeof BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS)[number]["value"];

const TAB_VALUES = new Set<string>(
  BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS.map((option) => option.value),
);

export function parseBacksterosCodebaseListTab(
  value: unknown,
): BacksterosCodebaseListTab | undefined {
  return typeof value === "string" && TAB_VALUES.has(value)
    ? (value as BacksterosCodebaseListTab)
    : undefined;
}

/** Digit `1`–`9` → 0-based index into {@link BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS}. */
export function parseBacksterosCodebaseListTabIndex(key: string): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  return Number(key) - 1;
}

export function resolveBacksterosCodebaseListTabAtIndex(
  index: number,
): BacksterosCodebaseListTab | null {
  return BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS[index]?.value ?? null;
}

/** Overview is the route default — omit `tab` from the search string. */
export function backsterosCodebaseListTabSearch(
  tab: BacksterosCodebaseListTab,
): { readonly tab?: BacksterosCodebaseListTab } {
  return tab === "overview" ? {} : { tab };
}
