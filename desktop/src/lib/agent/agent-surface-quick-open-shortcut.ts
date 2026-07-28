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

type DigitShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code"
>;

/**
 * ⌘/⌃ + digit 1–9 → 1-based index, or null when not a digit shortcut.
 */
export function resolveAgentSurfaceDigitIndex(
  event: DigitShortcutEvent,
): number | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return null;
  }

  switch (event.code) {
    case "Digit1":
    case "Numpad1":
      return 1;
    case "Digit2":
    case "Numpad2":
      return 2;
    case "Digit3":
    case "Numpad3":
      return 3;
    case "Digit4":
    case "Numpad4":
      return 4;
    case "Digit5":
    case "Numpad5":
      return 5;
    case "Digit6":
    case "Numpad6":
      return 6;
    case "Digit7":
    case "Numpad7":
      return 7;
    case "Digit8":
    case "Numpad8":
      return 8;
    case "Digit9":
    case "Numpad9":
      return 9;
    default:
      return null;
  }
}

export type AgentSurfaceDigitShortcut =
  | { action: "quick-open"; kind: AgentSurfaceQuickOpenKind }
  | { action: "activate-tab"; index: number };

/**
 * ⌘1–⌘N behavior depends on whether surface tabs already exist:
 * - empty picker (0 tabs): open primary surfaces (Agent, Browser, …)
 * - tabs open: activate the Nth tab (1-based; out of range → null)
 */
export function resolveAgentSurfaceDigitShortcut(
  event: DigitShortcutEvent,
  options: { isCodebaseProject: boolean; tabCount: number },
): AgentSurfaceDigitShortcut | null {
  const digit = resolveAgentSurfaceDigitIndex(event);
  if (digit == null) return null;

  if (options.tabCount > 0) {
    if (digit > options.tabCount) return null;
    return { action: "activate-tab", index: digit - 1 };
  }

  const kind = listAgentSurfaceQuickOpenKinds(options.isCodebaseProject)[
    digit - 1
  ];
  return kind ? { action: "quick-open", kind } : null;
}

/**
 * ⌘1–⌘N (⌃1–⌃N) open primary surfaces when the empty picker is showing.
 * Codebase: Agent, Browser, Files, Plan, Diff
 * Other: Agent, Browser, Plan
 */
export function resolveAgentSurfaceQuickOpenShortcut(
  event: DigitShortcutEvent,
  isCodebaseProject: boolean,
): AgentSurfaceQuickOpenKind | null {
  const result = resolveAgentSurfaceDigitShortcut(event, {
    isCodebaseProject,
    tabCount: 0,
  });
  return result?.action === "quick-open" ? result.kind : null;
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
