/**
 * Composer Access mode (approval policy) — distinct from Build/Ask/Plan.
 */

export type AgentChatAccessMode =
  | "supervised"
  | "auto_accept_edits"
  | "full_access";

const STORAGE_PREFIX = "backsteros-desktop.agent-chat-access-mode.";

const ACCESS_MODE_ORDER: AgentChatAccessMode[] = [
  "supervised",
  "auto_accept_edits",
  "full_access",
];

export type AgentChatAccessModeOption = {
  id: AgentChatAccessMode;
  label: string;
  description: string;
};

export const AGENT_CHAT_ACCESS_MODE_OPTIONS: AgentChatAccessModeOption[] = [
  {
    id: "supervised",
    label: "Supervised",
    description: "Ask before commands and file changes.",
  },
  {
    id: "auto_accept_edits",
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
  },
  {
    id: "full_access",
    label: "Full access",
    description: "Allow commands and edits without prompts.",
  },
];

function storageKey(taskId: string): string {
  return `${STORAGE_PREFIX}${taskId.trim()}`;
}

export function normalizeAgentChatAccessMode(
  value: string | null | undefined,
): AgentChatAccessMode {
  if (value === "full_access") return "full_access";
  if (value === "auto_accept_edits") return "auto_accept_edits";
  return "supervised";
}

export function getAgentChatAccessModeOption(
  mode: AgentChatAccessMode,
): AgentChatAccessModeOption {
  return (
    AGENT_CHAT_ACCESS_MODE_OPTIONS.find((option) => option.id === mode) ??
    AGENT_CHAT_ACCESS_MODE_OPTIONS[0]!
  );
}

export function cycleAgentChatAccessMode(
  current: AgentChatAccessMode,
  delta = 1,
): AgentChatAccessMode {
  const index = ACCESS_MODE_ORDER.indexOf(current);
  const from = index >= 0 ? index : 0;
  const next =
    (from + delta + ACCESS_MODE_ORDER.length) % ACCESS_MODE_ORDER.length;
  return ACCESS_MODE_ORDER[next]!;
}

export function readAgentChatAccessMode(
  taskId: string,
): AgentChatAccessMode {
  if (typeof window === "undefined") return "supervised";
  try {
    const raw = window.localStorage.getItem(storageKey(taskId));
    return normalizeAgentChatAccessMode(raw);
  } catch {
    return "supervised";
  }
}

export function writeAgentChatAccessMode(
  taskId: string,
  mode: AgentChatAccessMode,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(taskId),
      normalizeAgentChatAccessMode(mode),
    );
  } catch {
    /* ignore */
  }
}
