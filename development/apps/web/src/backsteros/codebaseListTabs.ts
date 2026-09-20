/** Mirrors `@backsteros/ui` `CODEBASE_LIST_TAB_OPTIONS`. */
export const BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS = [
  { value: "tasks" as const, label: "Tasks" },
  { value: "files" as const, label: "Files" },
  { value: "docs" as const, label: "Documents" },
  { value: "commits" as const, label: "Commits" },
  { value: "pulls" as const, label: "PRs" },
  { value: "updates" as const, label: "Updates" },
] as const;

export type BacksterosCodebaseListTab =
  (typeof BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS)[number]["value"];
