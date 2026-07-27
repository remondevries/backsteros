import type {
  AgentChatActivityItem,
  AgentChatTurnSegment,
  AgentChatTurnUiState,
} from "./agent-acp-activity";
import {
  activitiesFromSegments,
  assistantDraftFromSegments,
  emptyAgentChatTurnUiState,
  segmentsFromActivitiesAndText,
} from "./agent-acp-activity";
import type { AgentChatMessage } from "./agent-chat-transcript";

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
  const aCount = a?.length ?? 0;
  const bCount = b?.length ?? 0;
  if (bCount > aCount) return b;
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
      planSteps:
        (patch.planSteps?.length ?? 0) > (last.planSteps?.length ?? 0)
          ? patch.planSteps
          : last.planSteps ?? patch.planSteps,
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

  const message: AgentChatMessage = {
    id: patch.id,
    role: "assistant",
    text: patch.text,
    createdAt: patch.createdAt,
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

/** Pick the latest assistant message that still looks like an open turn. */
export function findRehydratableLiveAssistant(
  messages: readonly AgentChatMessage[],
): AgentChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "assistant") continue;
    const hasTimeline =
      Boolean(message.activities?.length) || Boolean(message.segments?.length);
    if (!hasTimeline && !message.text.trim()) continue;
    return message;
  }
  return null;
}
