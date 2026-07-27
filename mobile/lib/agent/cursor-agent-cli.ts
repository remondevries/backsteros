/** Cursor Agent chat helpers (mobile port of desktop cursor-agent-cli). */

const CHAT_ID_RE =
  /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

export function isCursorChatId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function cursorAgentResumeCommand(
  chatId: string,
  prompt?: string | null,
): string {
  const id = chatId.trim();
  const text = prompt?.trim();
  if (!text) return `agent --resume ${id}\n`;
  return `agent --resume ${id} ${shellSingleQuote(text)}\n`;
}

export type AgentTerminalAction =
  | "abort"
  | "noop"
  | "prompt-in-tui"
  | "shell-resume"
  | "quit-then-shell-resume";

export type ResolveAgentTerminalActionInput = {
  tuiOpen: boolean;
  attachedChatId?: string | null;
  boundChatId?: string | null;
  requestedChatId: string;
  sessionIsNew?: boolean;
  destroyed?: boolean;
  prompt?: string | null;
};

function normalizeChatId(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() || null;
  return trimmed || null;
}

export function resolveAgentTerminalAction(
  input: ResolveAgentTerminalActionInput,
): AgentTerminalAction {
  const requested = normalizeChatId(input.requestedChatId);
  if (!requested) return "abort";
  if (input.destroyed) return "abort";

  const prompt = input.prompt?.trim() || null;
  const attached = normalizeChatId(input.attachedChatId);
  const bound = normalizeChatId(input.boundChatId);
  const sessionIsNew = Boolean(input.sessionIsNew);
  const tuiOpen = Boolean(input.tuiOpen);

  const sameChat =
    attached === requested ||
    (attached == null && bound === requested && !sessionIsNew);

  if (!tuiOpen) return "shell-resume";

  if (attached === requested) {
    if (sessionIsNew) return "noop";
    return prompt ? "prompt-in-tui" : "noop";
  }

  if (sessionIsNew || !sameChat) {
    return "quit-then-shell-resume";
  }

  return prompt ? "prompt-in-tui" : "noop";
}

/** Enter / submit key for the agent prompt (CR). */
export function cursorAgentSubmitKey(): string {
  return "\r";
}

/**
 * Clear the Agent TUI composer before typing a new prompt.
 * Ctrl+U (readline kill-line), sent twice for leftover multiline drafts.
 */
export function cursorAgentClearComposerKeys(): string {
  return "\x15\x15";
}

export const CURSOR_AGENT_CLEAR_COMPOSER_DELAY_MS = 80;
export const CURSOR_AGENT_OPEN_PROMPT_SUBMIT_DELAY_MS = 120;

export function extractCursorChatIdFromText(text: string): string | null {
  const any = text.match(CHAT_ID_RE);
  return any?.[1]?.toLowerCase() ?? null;
}
