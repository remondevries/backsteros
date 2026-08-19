/**
 * Primary surfaces offered from the empty picker / + menu.
 * Files and Diff are codebase-project only.
 * Diff is omitted until the agent has produced reviewable file changes.
 * Mirrors desktop `agent-surface-quick-open-shortcut.ts` (no shared UI).
 */

export const AGENT_SURFACE_QUICK_OPEN_BASE_KINDS = [
  "chat",
  "browser",
  "plan",
] as const;

export const AGENT_SURFACE_QUICK_OPEN_CODEBASE_KINDS = [
  "chat",
  "browser",
  "files",
  "plan",
  "diff",
] as const;

export type AgentSurfaceQuickOpenKind =
  | (typeof AGENT_SURFACE_QUICK_OPEN_BASE_KINDS)[number]
  | (typeof AGENT_SURFACE_QUICK_OPEN_CODEBASE_KINDS)[number];

export type AgentSurfaceQuickOpenOption = {
  kind: AgentSurfaceQuickOpenKind;
  label: string;
  description: string;
  needsCwd: boolean;
  codebaseOnly: boolean;
};

export type AgentSurfaceQuickOpenVisibility = {
  isCodebaseProject: boolean;
  /** When false, Diff is hidden (no agent file changes yet). Default true. */
  diffAvailable?: boolean;
};

const QUICK_OPEN_OPTIONS: readonly AgentSurfaceQuickOpenOption[] = [
  {
    kind: "chat",
    label: "Agent",
    description: "Start an agent session and talk on this task.",
    needsCwd: false,
    codebaseOnly: false,
  },
  {
    kind: "browser",
    label: "Browser",
    description: "Open a local app or URL.",
    needsCwd: false,
    codebaseOnly: false,
  },
  {
    kind: "files",
    label: "Files",
    description: "Browse and read workspace files.",
    needsCwd: true,
    codebaseOnly: true,
  },
  {
    kind: "plan",
    label: "Plan",
    description: "Review the agent’s proposed plan.",
    needsCwd: false,
    codebaseOnly: false,
  },
  {
    kind: "diff",
    label: "Diff",
    description: "Review changes from this turn.",
    needsCwd: false,
    codebaseOnly: true,
  },
];

function normalizeQuickOpenVisibility(
  visibility: boolean | AgentSurfaceQuickOpenVisibility,
): Required<AgentSurfaceQuickOpenVisibility> {
  if (typeof visibility === "boolean") {
    return { isCodebaseProject: visibility, diffAvailable: true };
  }
  return {
    isCodebaseProject: visibility.isCodebaseProject,
    diffAvailable: visibility.diffAvailable ?? true,
  };
}

/** Ordered options for the current project type / diff availability. */
export function listAgentSurfaceQuickOpenOptions(
  visibility: boolean | AgentSurfaceQuickOpenVisibility,
): AgentSurfaceQuickOpenOption[] {
  const { isCodebaseProject, diffAvailable } =
    normalizeQuickOpenVisibility(visibility);
  return QUICK_OPEN_OPTIONS.filter((option) => {
    if (!isCodebaseProject && option.codebaseOnly) return false;
    if (option.kind === "diff" && !diffAvailable) return false;
    return true;
  });
}

export function listAgentSurfaceQuickOpenKinds(
  visibility: boolean | AgentSurfaceQuickOpenVisibility,
): AgentSurfaceQuickOpenKind[] {
  return listAgentSurfaceQuickOpenOptions(visibility).map(
    (option) => option.kind,
  );
}
