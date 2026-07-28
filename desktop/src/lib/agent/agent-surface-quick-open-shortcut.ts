import type { AgentSurfaceTabKind } from "./agent-surface-tabs.ts";

/**
 * Primary surfaces offered from the empty picker / + menu / ⌘N hotkeys.
 * Files and Diff are codebase-project only.
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
  /** Shown on the empty-picker splash cards only — not in the + dropdown. */
  description: string;
  /** Files needs a project working directory. */
  needsCwd: boolean;
  codebaseOnly: boolean;
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

/** Ordered options for the current project type. */
export function listAgentSurfaceQuickOpenOptions(
  isCodebaseProject: boolean,
): AgentSurfaceQuickOpenOption[] {
  return QUICK_OPEN_OPTIONS.filter(
    (option) => isCodebaseProject || !option.codebaseOnly,
  );
}

export function listAgentSurfaceQuickOpenKinds(
  isCodebaseProject: boolean,
): AgentSurfaceQuickOpenKind[] {
  return listAgentSurfaceQuickOpenOptions(isCodebaseProject).map(
    (option) => option.kind,
  );
}

/**
 * ⌘1–⌘N (⌃1–⌃N) open primary surfaces.
 * Codebase: Agent, Browser, Files, Plan, Diff
 * Other: Agent, Browser, Plan
 */
export function resolveAgentSurfaceQuickOpenShortcut(
  event: Pick<
    KeyboardEvent,
    "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code"
  >,
  isCodebaseProject: boolean,
): AgentSurfaceQuickOpenKind | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return null;
  }

  const digit =
    event.code === "Digit1" || event.code === "Numpad1"
      ? 1
      : event.code === "Digit2" || event.code === "Numpad2"
        ? 2
        : event.code === "Digit3" || event.code === "Numpad3"
          ? 3
          : event.code === "Digit4" || event.code === "Numpad4"
            ? 4
            : event.code === "Digit5" || event.code === "Numpad5"
              ? 5
              : null;
  if (digit == null) return null;

  const kinds = listAgentSurfaceQuickOpenKinds(isCodebaseProject);
  return kinds[digit - 1] ?? null;
}

/** Display label for picker cards (Mac-first desktop shell). */
export function agentSurfaceQuickOpenHotkeyLabel(
  kind: AgentSurfaceQuickOpenKind,
  isCodebaseProject: boolean,
): string {
  const index = listAgentSurfaceQuickOpenKinds(isCodebaseProject).indexOf(kind);
  if (index < 0) return "";
  return `⌘${index + 1}`;
}

export function isAgentSurfaceQuickOpenKind(
  kind: AgentSurfaceTabKind,
): kind is AgentSurfaceQuickOpenKind {
  return QUICK_OPEN_OPTIONS.some((option) => option.kind === kind);
}
