/** Cursor Agent chat ids are UUIDs. */
const CHAT_ID_RE =
  /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

/** Prefer an explicit `--resume` mention when present in terminal output. */
const RESUME_CHAT_ID_RE =
  /(?:agent|cursor-agent|ca)\s+(?:--resume(?:=|\s+)|resume\s+)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export function isCursorChatId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export function extractCursorChatIdFromText(text: string): string | null {
  const resume = text.match(RESUME_CHAT_ID_RE);
  if (resume?.[1]) return resume[1].toLowerCase();
  const any = text.match(CHAT_ID_RE);
  return any?.[1]?.toLowerCase() ?? null;
}

/** POSIX single-quote a string for safe inclusion in a shell command. */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Shell command that resumes a Cursor Agent chat in the task terminal.
 * Optional `prompt` is passed as the initial agent turn (starts work immediately).
 */
export function cursorAgentResumeCommand(
  chatId: string,
  prompt?: string | null,
): string {
  const id = chatId.trim();
  const text = prompt?.trim();
  if (!text) return `agent --resume ${id}\n`;
  return `agent --resume ${id} ${shellSingleQuote(text)}\n`;
}

/**
 * Terminal action for talking to an agent (Start / View / Retry / Continue).
 * Destroy is handled separately (quit only when TUI open + wipe binding).
 */
export type AgentTerminalAction =
  /** Requested chat was destroyed — do nothing. */
  | "abort"
  /** Agent TUI is open on this chat; nothing to send. */
  | "noop"
  /** Agent TUI is open on this chat; type prompt and submit. */
  | "prompt-in-tui"
  /** Shell is up; run `agent --resume` (optionally with prompt). */
  | "shell-resume"
  /** TUI is up for a different/unknown session; `/quit` then shell-resume. */
  | "quit-then-shell-resume";

export type ResolveAgentTerminalActionInput = {
  /** Live Agent TUI in this task's PTY. */
  tuiOpen: boolean;
  /** Chat id currently tracked as attached in this task terminal, if any. */
  attachedChatId?: string | null;
  /** Persisted task↔chat binding, if any. */
  boundChatId?: string | null;
  /** Chat id we want to talk to. */
  requestedChatId: string;
  /** True when this request just created the chat — never trust a leftover TUI. */
  sessionIsNew?: boolean;
  /** True when requestedChatId was destroyed and must never be resumed. */
  destroyed?: boolean;
  prompt?: string | null;
};

function normalizeChatId(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase() || null;
  return trimmed || null;
}

/**
 * Single decision table for Start / View / hold-reply.
 *
 * Same chat := attached === requested, OR (attached == null && bound === requested
 * && !sessionIsNew). A brand-new chat never reuses a leftover TUI for a
 * *different* session — but once we've attached the new chat, re-entrant
 * calls must not `/quit` or re-submit the bootstrap prompt.
 */
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

  // Already attached to this chat (including re-entrant Start Agent after the
  // first resume). Never quit or re-fire the bootstrap prompt.
  if (attached === requested) {
    if (sessionIsNew) return "noop";
    return prompt ? "prompt-in-tui" : "noop";
  }

  if (sessionIsNew || !sameChat) {
    return "quit-then-shell-resume";
  }

  return prompt ? "prompt-in-tui" : "noop";
}

/** @deprecated Use {@link resolveAgentTerminalAction}. */
export type AgentSessionRunMode =
  | "prompt-in-tui"
  | "noop"
  | "shell-resume";

/** @deprecated Use {@link resolveAgentTerminalAction}. */
export function resolveAgentSessionRunMode(input: {
  agentCliOpen: boolean;
  attachedChatId?: string | null;
  requestedChatId: string;
  prompt?: string | null;
  boundChatId?: string | null;
  sessionIsNew?: boolean;
  destroyed?: boolean;
}): AgentSessionRunMode {
  const action = resolveAgentTerminalAction({
    tuiOpen: input.agentCliOpen,
    attachedChatId: input.attachedChatId,
    boundChatId: input.boundChatId,
    requestedChatId: input.requestedChatId,
    prompt: input.prompt,
    sessionIsNew: input.sessionIsNew,
    destroyed: input.destroyed,
  });
  if (action === "abort") return "noop";
  if (action === "quit-then-shell-resume") return "shell-resume";
  return action;
}

/** Slash command text that exits the in-terminal Cursor Agent TUI.
 * `/quit` and `/exit` are aliases in Cursor CLI; prefer `/quit`. */
export function cursorAgentQuitText(): string {
  return "/quit";
}

/** Enter / submit key for the agent prompt (CR). Do not use LF — that inserts a newline. */
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

/**
 * Delay after clearing the open-agent composer before typing the next prompt.
 */
export const CURSOR_AGENT_CLEAR_COMPOSER_DELAY_MS = 80;

/**
 * Delay between typing a prompt into an open Agent TUI and submitting with CR.
 * Matches the `/quit` → Enter timing used elsewhere.
 */
export const CURSOR_AGENT_OPEN_PROMPT_SUBMIT_DELAY_MS = 120;

/** Delay after `/quit` before typing `agent --resume` into the shell. */
export const CURSOR_AGENT_QUIT_THEN_RESUME_DELAY_MS = 500;

/** Shell command that wipes the terminal after the agent TUI has exited. */
export function shellClearCommand(): string {
  return "clear\n";
}

/**
 * Double Ctrl+D — Cursor CLI's documented exit (requires two presses).
 * Prefer `/quit` + Enter for End; keep this for callers that need a raw exit.
 */
export function cursorAgentCtrlDExit(): string {
  return "\x04\x04";
}

export type AgentAttachRequest = {
  taskId: string;
  chatId: string;
  /** When set, resume with this initial prompt so the agent starts a turn. */
  prompt?: string | null;
  /**
   * True when this chat was just created. Never prompt into a leftover TUI —
   * quit then shell-resume instead.
   */
  sessionIsNew?: boolean;
  /**
   * When false, attach in the background without expanding the terminal.
   * Defaults to true (Start working / Open). Ready-to-Start auto-launch uses false.
   */
  focusUi?: boolean;
  /**
   * View agent: focus/reattach only — never /quit. When the TUI is already
   * open, the terminal noops instead of shell-resuming into the live composer.
   * Stale attach alone must not block resume after the TUI has left.
   */
  forceReattach?: boolean;
  /**
   * When this attach was started from a hold-thread reply, the root comment id.
   * The next agent status comment (review / hold) should post as a reply under
   * that thread.
   */
  replyParentCommentId?: string | null;
};

/** End a bound agent session: run `/quit` when it is attached, then drop the UI binding. */
export type AgentEndRequest = {
  taskId: string;
  chatId: string;
};
