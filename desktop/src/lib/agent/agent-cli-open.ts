import type { AgentActivity } from "./agent-activity";

export type AgentCliOpenSignals = {
  /** Live xterm ↔ PTY WebSocket for this task terminal. */
  uiConnected: boolean;
  /** Tab/OSC title currently looks like Cursor Agent. */
  hasAgentTitle: boolean;
  titleConfirmed: boolean;
  hookLive: boolean;
  activity?: AgentActivity | null;
  /** Soft: chat was targeted into this PTY (cleared on sessionEnd / End). */
  attached: boolean;
  /** Soft: session marked as Cursor Agent (resume / OSC / hooks). */
  markedAsAgent: boolean;
};

/**
 * Whether the Cursor Agent TUI is present in this task's terminal.
 * Drives Stop agent vs View agent and talk/quit gates.
 *
 * Hard signals (title / hooks / activity) win while the UI is connected.
 * Soft attach/mark only counts with a live socket — never after UI detach,
 * so a leftover attach key cannot keep Stop agent stuck forever.
 */
export function isAgentCliOpenFromSignals(
  input: AgentCliOpenSignals,
): boolean {
  if (!input.uiConnected) return false;
  if (input.titleConfirmed || input.hookLive) return true;
  if (input.hasAgentTitle) return true;
  const activity = input.activity ?? null;
  if (activity === "working" || activity === "attention") return true;
  // Soft open while resume/attach is in flight on a live PTY.
  if (input.attached && input.markedAsAgent) return true;
  return false;
}

/**
 * After a non-agent OSC title, wait this long before treating the TUI as gone.
 * Cursor often blips shell titles while the Agent TUI is still up; a short
 * debounce avoids flickering Stop → View mid-session, while still recovering
 * when the user exits and sessionEnd is missed.
 */
export const AGENT_CLI_LEAVE_DEBOUNCE_MS = 1_200;
