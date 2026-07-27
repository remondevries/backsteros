/** Token / duration stats for one Cursor Agent turn. */
export type AgentTurnUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  status: string | null;
  conversationId: string | null;
};

/** How the observer decided the turn ended. */
export type AgentTurnCompleteReason = "stop" | "sessionEnd" | "fallback";

export type AgentTurnCompletedEvent = {
  taskId: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
  chatId: string | null;
  status: string | null;
  /** Last `afterAgentResponse` text for this turn, when available. */
  assistantText: string | null;
  /** Primary signal that ended the turn. */
  reason: AgentTurnCompleteReason;
  /**
   * True when the TUI left while a turn was still armed (crash / quit mid-turn).
   * Only meaningful for `reason: "sessionEnd"`.
   */
  abrupt: boolean;
};

export function parseAgentTurnUsage(value: unknown): AgentTurnUsage | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const asInt = (entry: unknown): number | null => {
    if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) {
      return Math.round(entry);
    }
    return null;
  };
  const inputTokens = asInt(raw.inputTokens ?? raw.input_tokens);
  const outputTokens = asInt(raw.outputTokens ?? raw.output_tokens);
  const cacheReadTokens = asInt(raw.cacheReadTokens ?? raw.cache_read_tokens);
  const cacheWriteTokens = asInt(
    raw.cacheWriteTokens ?? raw.cache_write_tokens,
  );
  let totalTokens = asInt(raw.totalTokens ?? raw.total_tokens);
  if (totalTokens == null) {
    const parts = [
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
    ].filter((part): part is number => part != null);
    if (parts.length > 0) {
      totalTokens = parts.reduce((sum, part) => sum + part, 0);
    }
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    durationMs: asInt(raw.durationMs ?? raw.duration_ms),
    status: typeof raw.status === "string" ? raw.status : null,
    conversationId:
      typeof raw.conversationId === "string"
        ? raw.conversationId
        : typeof raw.conversation_id === "string"
          ? raw.conversation_id
          : null,
  };
}

export function formatDurationMs(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return seconds > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
        ? `${hours}h ${minutes}m`
        : `${hours}h`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 10_000) return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1000)}k`;
  }
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
