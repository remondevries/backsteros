export const CODEBASE_WORKBENCH_TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "files", label: "Files" },
  { id: "commits", label: "Commits" },
  { id: "pulls", label: "PRs" },
] as const;

export type CodebaseWorkbenchTabId =
  (typeof CODEBASE_WORKBENCH_TABS)[number]["id"];

export const DEFAULT_CODEBASE_WORKBENCH_TAB: CodebaseWorkbenchTabId = "tasks";
