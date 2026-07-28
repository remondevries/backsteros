import {
  activitiesFromSegments,
  applyAssistantTextToTurn,
  assistantDraftFromSegments,
  emptyAgentChatTurnUiState,
  segmentsFromActivitiesAndText,
} from "./agent-acp-activity";
import type {
  AgentChatActivityItem,
  AgentChatTurnSegment,
  AgentChatTurnUiState,
} from "./agent-acp-activity";
import type { AgentChatMessage } from "./agent-chat-transcript";
import { preferPlanSteps } from "./t3-port/cursor-todos";

function newMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneActivities(
  items: readonly AgentChatActivityItem[] | undefined,
): AgentChatActivityItem[] | undefined {
  if (!items?.length) return undefined;
  return items.map((item) => ({ ...item }));
}

function cloneSegments(
  segments: readonly AgentChatTurnSegment[] | undefined,
): AgentChatTurnSegment[] | undefined {
  if (!segments?.length) return undefined;
  return segments.map((segment) =>
    segment.kind === "text"
      ? { ...segment }
      : {
          ...segment,
          activities: segment.activities.map((item) => ({ ...item })),
        },
  );
}

function preferRicherActivities(
  a: AgentChatActivityItem[] | undefined,
  b: AgentChatActivityItem[] | undefined,
): AgentChatActivityItem[] | undefined {
  const score = (items: AgentChatActivityItem[] | undefined): number => {
    if (!items?.length) return 0;
    let total = items.length;
    for (const item of items) {
      total += item.diff?.lines?.length ?? 0;
      total += (item.diff?.additions ?? 0) + (item.diff?.deletions ?? 0);
    }
    return total;
  };
  const aScore = score(a);
  const bScore = score(b);
  if (bScore > aScore) return b;
  return a ?? b;
}

function preferRicherSegments(
  a: AgentChatTurnSegment[] | undefined,
  b: AgentChatTurnSegment[] | undefined,
): AgentChatTurnSegment[] | undefined {
  const aCount = a?.length ?? 0;
  const bCount = b?.length ?? 0;
  if (bCount > aCount) return b;
  return a ?? b;
}

export type LiveTurnTimelinePatch = {
  id: string;
  text: string;
  createdAt: number;
  activities?: AgentChatActivityItem[];
  segments?: AgentChatTurnSegment[];
  planSteps?: AgentChatMessage["planSteps"];
  proposedPlanMarkdown?: string | null;
  workedStartedAt?: number | null;
};

/** Build a durable assistant timeline patch from live turn UI. */
export function liveTurnToTimelinePatch(
  turn: AgentChatTurnUiState,
  options: {
    messageId: string | null;
    createdAt?: number;
    workedStartedAt?: number | null;
    seal?: boolean;
    checkpointPatches?: readonly string[];
  },
): LiveTurnTimelinePatch | null {
  const activities = cloneActivities(turn.activities);
  const segments =
    cloneSegments(turn.segments) ??
    segmentsFromActivitiesAndText(activities, turn.assistantDraft);
  const text =
    turn.assistantDraft.trim() ||
    assistantDraftFromSegments(segments ?? []).trim();
  const hasTimeline =
    Boolean(activities?.length) ||
    Boolean(segments?.length) ||
    Boolean(turn.planSteps.length) ||
    Boolean(turn.proposedPlanMarkdown?.trim());
  if (!text && !hasTimeline && !options.seal) return null;

  return {
    id: options.messageId?.trim() || newMessageId(),
    text,
    createdAt: options.createdAt ?? Date.now(),
    ...(activities ? { activities } : {}),
    ...(segments && segments.length > 0 ? { segments } : {}),
    ...(turn.planSteps.length > 0
      ? { planSteps: turn.planSteps.map((step) => ({ ...step })) }
      : {}),
    ...(turn.proposedPlanMarkdown
      ? { proposedPlanMarkdown: turn.proposedPlanMarkdown }
      : {}),
    ...(options.workedStartedAt != null
      ? { workedStartedAt: options.workedStartedAt }
      : {}),
  };
}

/**
 * Upsert the in-progress assistant turn into the local messages array.
 * Returns the stable message id for this live turn.
 *
 * T3 always inserts the optimistic user message before any assistant/work
 * rows for the turn. Refuse to append a new assistant until a trailing user
 * message exists — otherwise a raced persist puts the reply above the prompt.
 */
export function applyLiveTurnTimelineToMessages(
  messages: readonly AgentChatMessage[],
  patch: LiveTurnTimelinePatch,
): { messages: AgentChatMessage[]; messageId: string } {
  const last = messages[messages.length - 1];
  const sameId = last?.role === "assistant" && last.id === patch.id;
  // Trailing assistant with tools but no reply yet — same open turn (id may
  // have been minted on an earlier remount).
  const openInProgress =
    last?.role === "assistant" &&
    !last.text.trim() &&
    (Boolean(last.activities?.length) || Boolean(last.segments?.length));

  if (last?.role === "assistant" && (sameId || openInProgress)) {
    const nextMessage: AgentChatMessage = {
      ...last,
      id: sameId ? last.id : patch.id || last.id,
      text: patch.text.trim() || last.text,
      activities: preferRicherActivities(last.activities, patch.activities),
      segments: preferRicherSegments(last.segments, patch.segments),
      planSteps: preferPlanSteps(last.planSteps, patch.planSteps),
      proposedPlanMarkdown:
        patch.proposedPlanMarkdown?.trim() ||
        last.proposedPlanMarkdown ||
        patch.proposedPlanMarkdown,
      workedStartedAt: last.workedStartedAt ?? patch.workedStartedAt ?? null,
    };
    return {
      messages: [...messages.slice(0, -1), nextMessage],
      messageId: nextMessage.id,
    };
  }

  // No trailing user yet (send still awaiting git head / bootstrap race) —
  // keep the prior transcript and retry on the next persist tick.
  if (last?.role !== "user") {
    return { messages: [...messages], messageId: patch.id };
  }

  const message: AgentChatMessage = {
    id: patch.id,
    role: "assistant",
    text: patch.text,
    // Keep assistant strictly after its user when clocks race.
    createdAt: Math.max(patch.createdAt, last.createdAt + 1),
    ...(patch.activities ? { activities: patch.activities } : {}),
    ...(patch.segments ? { segments: patch.segments } : {}),
    ...(patch.planSteps ? { planSteps: patch.planSteps } : {}),
    ...(patch.proposedPlanMarkdown
      ? { proposedPlanMarkdown: patch.proposedPlanMarkdown }
      : {}),
    ...(patch.workedStartedAt != null
      ? { workedStartedAt: patch.workedStartedAt }
      : {}),
  };
  return { messages: [...messages, message], messageId: message.id };
}

/** Rebuild live turn UI from a persisted assistant message (remount). */
export function rehydrateTurnUiFromMessage(
  message: AgentChatMessage | null | undefined,
): AgentChatTurnUiState {
  if (!message || message.role !== "assistant") {
    return emptyAgentChatTurnUiState();
  }
  const segments =
    message.segments && message.segments.length > 0
      ? cloneSegments(message.segments)!
      : segmentsFromActivitiesAndText(message.activities, message.text);
  const activities =
    cloneActivities(message.activities) ??
    activitiesFromSegments(segments);
  const assistantDraft =
    message.text.trim() || assistantDraftFromSegments(segments);
  const hasOpenWork = activities.some(
    (item) => item.status === "pending" || item.status === "in_progress",
  );
  return {
    activities,
    segments,
    assistantDraft,
    phase: hasOpenWork
      ? "tooling"
      : assistantDraft
        ? "responding"
        : "thinking",
    planSteps: message.planSteps ? message.planSteps.map((s) => ({ ...s })) : [],
    proposedPlanMarkdown: message.proposedPlanMarkdown ?? null,
    pendingTools: {},
    toolCallPayloads: {},
  };
}

/** True when the settled assistant row would duplicate the live overlay. */
export function shouldSuppressSettledAssistantForLiveTurn(
  message: AgentChatMessage | null | undefined,
  liveTurnMessageId: string | null | undefined,
  working: boolean,
): boolean {
  if (!working || !message || message.role !== "assistant") return false;
  const liveId = liveTurnMessageId?.trim();
  if (!liveId) return false;
  return message.id === liveId;
}

/**
 * Whether a persisted assistant turn still looks unsettled (T3: running turn /
 * incomplete completion). Sealed answers must not resurrect Working… chrome.
 */
export function assistantMessageLooksOpen(
  message: AgentChatMessage | null | undefined,
): boolean {
  if (!message || message.role !== "assistant") return false;
  const activities = message.activities ?? [];
  const hasOpenWork = activities.some(
    (item) => item.status === "pending" || item.status === "in_progress",
  );
  if (hasOpenWork) return true;
  const hasTimeline =
    activities.length > 0 || Boolean(message.segments?.length);
  // Tools started but no final reply text yet — still mid-turn.
  return hasTimeline && !message.text.trim();
}

/** Pick the latest assistant message that still looks like an open turn. */
export function findRehydratableLiveAssistant(
  messages: readonly AgentChatMessage[],
): AgentChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!assistantMessageLooksOpen(message)) continue;
    return message;
  }
  return null;
}

/**
 * Fold late assistant text into the last sealed assistant turn.
 * Used when `afterAgentResponse` arrives after stop (CLI often does this) —
 * must not reopen a live Working… turn (pty-server WORKING_HOOK_EVENTS parity).
 */
export function foldAssistantTextIntoLastMessage(
  messages: readonly AgentChatMessage[],
  text: string,
): AgentChatMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return messages as AgentChatMessage[];
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return messages as AgentChatMessage[];
  if (last.text.trim() === trimmed) return messages as AgentChatMessage[];

  const segments =
    last.segments && last.segments.length > 0
      ? cloneSegments(last.segments)!
      : segmentsFromActivitiesAndText(last.activities, last.text);
  const asTurn: AgentChatTurnUiState = {
    activities:
      cloneActivities(last.activities) ?? activitiesFromSegments(segments),
    segments,
    assistantDraft: last.text,
    phase: "idle",
    planSteps: last.planSteps ? last.planSteps.map((step) => ({ ...step })) : [],
    proposedPlanMarkdown: last.proposedPlanMarkdown ?? null,
    pendingTools: {},
    toolCallPayloads: {},
  };
  const upgraded = applyAssistantTextToTurn(asTurn, trimmed);
  const nextText =
    upgraded.assistantDraft.trim() ||
    assistantDraftFromSegments(upgraded.segments) ||
    trimmed;
  const nextMessage: AgentChatMessage = {
    ...last,
    text: nextText,
    activities:
      upgraded.activities.length > 0 ? upgraded.activities : last.activities,
    segments:
      upgraded.segments.length > 0 ? upgraded.segments : last.segments,
  };
  return [...messages.slice(0, -1), nextMessage];
}
