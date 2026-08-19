import * as SecureStore from "expo-secure-store";

/**
 * Agent interaction mode (Build / Plan / Ask) — mirrors desktop agent-chat-mode.
 */

export type AgentChatMode = "build" | "plan" | "ask";
export type CursorAgentModeId = "agent" | "plan" | "ask";

export type AgentChatModeOption = {
  id: AgentChatMode;
  label: string;
  description: string;
  cursorModeId: CursorAgentModeId;
  /** Active chip color — mirrors desktop `is-green|yellow|blue`. */
  color: "green" | "yellow" | "blue";
};

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

const STORAGE_KEY = "backsteros-mobile.agent-chat-mode";
const DEFAULT_MODE: AgentChatMode = "build";

let cachedMode: AgentChatMode | null = null;

export function normalizeAgentChatMode(
  value: string | null | undefined,
): AgentChatMode {
  const trimmed = value?.trim().toLowerCase() ?? "";
  if (trimmed === "agent" || trimmed === "default" || trimmed === "build") {
    return "build";
  }
  if (trimmed === "plan") return "plan";
  if (trimmed === "ask") return "ask";
  return DEFAULT_MODE;
}

export function agentChatModeToCursorModeId(
  mode: AgentChatMode,
): CursorAgentModeId {
  const option = AGENT_CHAT_MODE_OPTIONS.find((entry) => entry.id === mode);
  return option?.cursorModeId ?? "agent";
}

export function getAgentChatModeOption(
  mode: AgentChatMode,
): AgentChatModeOption {
  return (
    AGENT_CHAT_MODE_OPTIONS.find((entry) => entry.id === mode) ??
    AGENT_CHAT_MODE_OPTIONS[0]!
  );
}

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

export function agentChatModeSlashCommand(mode: AgentChatMode): string | null {
  switch (mode) {
    case "ask":
      return "/ask";
    case "plan":
      return "/plan";
    case "build":
    default:
      return null;
  }
}

export function readAgentChatModeCached(): AgentChatMode {
  return cachedMode ?? DEFAULT_MODE;
}

export async function hydrateAgentChatMode(): Promise<AgentChatMode> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    cachedMode = normalizeAgentChatMode(raw);
    return cachedMode;
  } catch {
    cachedMode = DEFAULT_MODE;
    return DEFAULT_MODE;
  }
}

export async function writeAgentChatMode(mode: AgentChatMode): Promise<void> {
  const next = normalizeAgentChatMode(mode);
  cachedMode = next;
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}
