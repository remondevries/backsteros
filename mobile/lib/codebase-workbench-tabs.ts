/** Min window width for the iPad list|detail workbench. */
export const CODEBASE_PAD_SPLIT_MIN_WIDTH = 700;

/**
 * Codebase project sections.
 * Overview matches the default project type (iPhone requirement); iPad keeps
 * list|detail for Tasks / Files / Commits / PRs under the same tab strip.
 */
export const CODEBASE_WORKBENCH_TABS = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "files", label: "Files" },
  { id: "commits", label: "Commits" },
  { id: "pulls", label: "PRs" },
] as const;

export type CodebaseWorkbenchTabId =
  (typeof CODEBASE_WORKBENCH_TABS)[number]["id"];

export const DEFAULT_CODEBASE_WORKBENCH_TAB: CodebaseWorkbenchTabId =
  "overview";

/**
 * Left-pane list toggles on iPad — same set as desktop
 * (`Tasks | Files | Commits | PRs`). Overview stays a full-width section.
 */
export const CODEBASE_PAD_LIST_TABS = [
  { id: "tasks", label: "Tasks" },
  { id: "files", label: "Files" },
  { id: "commits", label: "Commits" },
  { id: "pulls", label: "PRs" },
] as const satisfies ReadonlyArray<{
  id: CodebaseWorkbenchTabId;
  label: string;
}>;

/** @deprecated Use CODEBASE_WORKBENCH_TABS — same tabs on phone and pad. */
export const CODEBASE_PHONE_SECTIONS = CODEBASE_WORKBENCH_TABS;

export type CodebasePhoneSectionId = CodebaseWorkbenchTabId;

export const DEFAULT_CODEBASE_PHONE_SECTION = DEFAULT_CODEBASE_WORKBENCH_TAB;
