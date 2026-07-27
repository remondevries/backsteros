/**
 * Agent interaction mode for desktop chat (Build / Plan / Ask).
 *
 * Maps to Cursor ACP `session/set_mode` ids (Cursor reports:
 * Valid modes: agent, plan, ask — no debug over ACP).
 * - build → agent (full tools)
 * - plan → plan (planning before edits)
 * - ask → ask (read-only Q&A)
 */

export type AgentChatMode = "build" | "plan" | "ask";

/** Cursor ACP / CLI `--mode` id. */
export type CursorAgentModeId = "agent" | "plan" | "ask";

export type AgentChatModeOption = {
  id: AgentChatMode;
  label: string;
  description: string;
  cursorModeId: CursorAgentModeId;
  /** CSS modifier for the active chip color. */
  color: "green" | "yellow" | "blue";
};

/** Cycle order for Shift+Tab (matches Cursor ACP modes). */
export const AGENT_CHAT_MODE_OPTIONS: readonly AgentChatModeOption[] = [
  {
    id: "build",
    label: "Build",
    description: "Full agent — edit files and run tools",
    cursorModeId: "agent",
    color: "green",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Plan first — design approach before coding",
    cursorModeId: "plan",
    color: "yellow",
  },
  {
    id: "ask",
    label: "Ask",
    description: "Read-only — explore and answer without edits",
    cursorModeId: "ask",
    color: "blue",
  },
] as const;

const STORAGE_KEY = "backsteros-desktop.agent-chat-mode";
const DEFAULT_MODE: AgentChatMode = "build";

let cachedMode: AgentChatMode | null = null;

export function isAgentChatMode(value: unknown): value is AgentChatMode {
  return value === "build" || value === "plan" || value === "ask";
}

export function normalizeAgentChatMode(
  value: string | null | undefined,
): AgentChatMode {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (trimmed === "agent" || trimmed === "default" || trimmed === "build") {
    return "build";
  }
  if (trimmed === "plan") return "plan";
  if (trimmed === "ask") return "ask";
  // Legacy stored "debug" — Cursor ACP does not support it.
  if (trimmed === "debug") return DEFAULT_MODE;
  return DEFAULT_MODE;
}

export function agentChatModeToCursorModeId(
  mode: AgentChatMode,
): CursorAgentModeId {
  const option = AGENT_CHAT_MODE_OPTIONS.find((entry) => entry.id === mode);
  return option?.cursorModeId ?? "agent";
}

export function cursorModeIdToAgentChatMode(
  modeId: string | null | undefined,
): AgentChatMode {
  return normalizeAgentChatMode(modeId);
}

export function readAgentChatMode(): AgentChatMode {
  if (cachedMode) return cachedMode;
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cachedMode = normalizeAgentChatMode(raw);
    return cachedMode;
  } catch {
    cachedMode = DEFAULT_MODE;
    return DEFAULT_MODE;
  }
}

export function writeAgentChatMode(mode: AgentChatMode): void {
  const next = normalizeAgentChatMode(mode);
  cachedMode = next;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function getAgentChatModeOption(
  mode: AgentChatMode,
): AgentChatModeOption {
  return (
    AGENT_CHAT_MODE_OPTIONS.find((entry) => entry.id === mode) ??
    AGENT_CHAT_MODE_OPTIONS[0]!
  );
}

/** Next mode in the Shift+Tab cycle (Build → Plan → Ask → …). */
export function cycleAgentChatMode(
  current: AgentChatMode,
  direction: 1 | -1 = 1,
): AgentChatMode {
  const index = AGENT_CHAT_MODE_OPTIONS.findIndex(
    (entry) => entry.id === current,
  );
  const from = index >= 0 ? index : 0;
  const next =
    (from + direction + AGENT_CHAT_MODE_OPTIONS.length) %
    AGENT_CHAT_MODE_OPTIONS.length;
  return AGENT_CHAT_MODE_OPTIONS[next]!.id;
}

/** Slash text that switches Cursor CLI TUI mode, or null when none exists. */
export function agentChatModeSlashCommand(mode: AgentChatMode): string | null {
  switch (mode) {
    case "ask":
      return "/ask";
    case "plan":
      return "/plan";
    case "build":
    default:
      // Cursor has no `/agent` slash — Build/Agent is the default.
      return null;
  }
}

/**
 * Cursor TUI slash sequence from one mode to another.
 * Mirrors Cursor ACP mode ids used by Chat (`session/set_mode`).
 */
export function cursorModeSlashSequence(
  from: CursorAgentModeId | null | undefined,
  to: CursorAgentModeId,
): string[] {
  const current = from === "ask" || from === "plan" ? from : "agent";
  const target = to === "ask" || to === "plan" ? to : "agent";
  if (current === target) return [];
  if (target === "ask") return ["/ask"];
  if (target === "plan") return ["/plan"];
  if (current === "ask") return ["/ask"];
  if (current === "plan") return ["/ask", "/ask"];
  return [];
}
