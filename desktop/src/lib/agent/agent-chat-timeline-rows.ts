/**
 * Flat LegendList rows for the desktop agent chat transcript (T3-style).
 */

import { shouldSuppressSettledAssistantForLiveTurn } from "./agent-chat-live-timeline";
import type { AgentChatMessage } from "./agent-chat-transcript";
import { pairAgentChatTurns } from "./agent-chat-turns";

export type AgentChatTimelineUserRow = {
  kind: "user";
  id: string;
  message: AgentChatMessage;
  /** Inclusive end index of this turn in the flat messages array. */
  turnEndIndex: number;
};

export type AgentChatTimelineAssistantRow = {
  kind: "assistant";
  id: string;
  message: AgentChatMessage;
  startedAt: number | null;
  isLatestTurn: boolean;
};

export type AgentChatTimelineLiveRow = {
  kind: "live";
  id: "live";
};

/** T3 `working-indicator-row` — own list item so “Working for…” stays pinned at end. */
export type AgentChatTimelineWorkingRow = {
  kind: "working";
  id: "working";
};

export type AgentChatTimelineRow =
  | AgentChatTimelineUserRow
  | AgentChatTimelineAssistantRow
  | AgentChatTimelineLiveRow
  | AgentChatTimelineWorkingRow;

export type DeriveAgentChatTimelineRowsInput = {
  messages: readonly AgentChatMessage[];
  showTurnChrome: boolean;
  working: boolean;
  liveTurnMessageId?: string | null;
};

/** Build flat timeline rows for LegendList from paired turns + live chrome. */
export function deriveAgentChatTimelineRows(
  input: DeriveAgentChatTimelineRowsInput,
): AgentChatTimelineRow[] {
  const {
    messages,
    showTurnChrome,
    working,
    liveTurnMessageId = null,
  } = input;
  const turns = pairAgentChatTurns(messages);
  const rows: AgentChatTimelineRow[] = [];

  for (const turn of turns) {
    if (turn.user) {
      rows.push({
        kind: "user",
        id: `user:${turn.user.id}`,
        message: turn.user,
        turnEndIndex: turn.endIndex,
      });
    }
    if (
      turn.assistant &&
      !shouldSuppressSettledAssistantForLiveTurn(
        turn.assistant,
        liveTurnMessageId,
        working,
      )
    ) {
      rows.push({
        kind: "assistant",
        id: `assistant:${turn.assistant.id}`,
        message: turn.assistant,
        startedAt: turn.user?.createdAt ?? null,
        isLatestTurn: !showTurnChrome && turn.endIndex === messages.length - 1,
      });
    }
  }

  if (showTurnChrome) {
    rows.push({ kind: "live", id: "live" });
  }
  // Match T3: append working chrome as its own row after live content so the
  // pulsing “Working for…” indicator is not buried inside a tall live cell
  // (and so LegendList maintainScrollAtEnd keeps it in view).
  if (working) {
    rows.push({ kind: "working", id: "working" });
  }

  return rows;
}

/** Anchor id for LegendList `anchoredEndSpace` — user message id. */
export function agentChatTimelineRowAnchorId(
  row: AgentChatTimelineRow,
): string | null {
  return row.kind === "user" ? row.message.id : null;
}

export function agentChatTimelineRowKey(row: AgentChatTimelineRow): string {
  return row.id;
}

export function agentChatTimelineRowType(row: AgentChatTimelineRow): string {
  return row.kind;
}
