import { preferPlanSteps } from "./agent-chat-activity";
import type { AgentChatMessage } from "./agent-chat-message";

function preferWorkedStartedAt(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null | undefined {
  if (typeof a === "number" && Number.isFinite(a)) {
    if (typeof b === "number" && Number.isFinite(b)) return Math.min(a, b);
    return a;
  }
  if (typeof b === "number" && Number.isFinite(b)) return b;
  return a ?? b;
}

function mergeFields(
  existing: AgentChatMessage,
  message: AgentChatMessage,
): AgentChatMessage {
  const existingActivityCount = existing.activities?.length ?? 0;
  const nextActivityCount = message.activities?.length ?? 0;
  const preferNewerActivities = nextActivityCount > existingActivityCount;
  const existingSegmentCount = existing.segments?.length ?? 0;
  const nextSegmentCount = message.segments?.length ?? 0;
  const preferNewerSegments = nextSegmentCount > existingSegmentCount;
  return {
    ...existing,
    ...message,
    text: message.text.trim() || existing.text,
    activities: preferNewerActivities
      ? message.activities
      : existing.activities ?? message.activities,
    segments: preferNewerSegments
      ? message.segments
      : existing.segments ?? message.segments,
    planSteps: preferPlanSteps(existing.planSteps, message.planSteps),
    proposedPlanMarkdown:
      message.proposedPlanMarkdown?.trim() ||
      existing.proposedPlanMarkdown ||
      message.proposedPlanMarkdown,
    workedStartedAt: preferWorkedStartedAt(
      existing.workedStartedAt,
      message.workedStartedAt,
    ),
    turnId: existing.turnId ?? message.turnId ?? null,
    turnStatus:
      message.turnStatus === "completed" ||
      message.turnStatus === "interrupted" ||
      message.turnStatus === "failed"
        ? message.turnStatus
        : (existing.turnStatus ?? message.turnStatus ?? null),
    turnStartedAt: preferWorkedStartedAt(
      existing.turnStartedAt,
      message.turnStartedAt,
    ),
    turnCompletedAt: message.turnCompletedAt ?? existing.turnCompletedAt ?? null,
    turnOutcome:
      existing.turnOutcome === "interrupted" ||
      message.turnOutcome === "interrupted"
        ? "interrupted"
        : (message.turnOutcome ?? existing.turnOutcome ?? null),
    id: existing.id,
    createdAt: Math.max(existing.createdAt, message.createdAt),
  };
}

export function repairInvertedUserAssistantPairs(
  messages: readonly AgentChatMessage[],
): AgentChatMessage[] {
  if (messages.length < 2) return [...messages];
  const next = [...messages];
  const i = next.length - 2;
  const current = next[i];
  const following = next[i + 1];
  if (
    current &&
    following &&
    current.role === "assistant" &&
    following.role === "user"
  ) {
    const previous = i > 0 ? next[i - 1] : null;
    const assistantLooksOpen =
      !current.text.trim() ||
      Boolean(
        current.activities?.some(
          (item) =>
            item.status === "pending" || item.status === "in_progress",
        ),
      );
    const willSwap = previous?.role !== "user" && assistantLooksOpen;
    if (willSwap) {
      next[i] = following;
      next[i + 1] = {
        ...current,
        createdAt: Math.max(current.createdAt, following.createdAt + 1),
      };
      return next;
    }
  }
  return [...messages];
}

/** Merge two transcript lists, keeping the richer activity timeline per turn. */
export function mergeTranscriptMessages(
  a: readonly AgentChatMessage[],
  b: readonly AgentChatMessage[],
): AgentChatMessage[] {
  const byId = new Map<string, AgentChatMessage>();
  const order: string[] = [];
  const fuzzyConsumed = new Set<string>();
  const userTextCounts = new Map<string, number>();
  for (const message of [...a, ...b]) {
    if (message.role !== "user") continue;
    const text = message.text.trim();
    if (!text) continue;
    userTextCounts.set(text, (userTextCounts.get(text) ?? 0) + 1);
  }

  function findFuzzyTwin(message: AgentChatMessage): AgentChatMessage | null {
    if (!message.text.trim()) return null;
    if (
      message.role === "user" &&
      (userTextCounts.get(message.text.trim()) ?? 0) > 2
    ) {
      return null;
    }
    for (const existing of byId.values()) {
      if (existing.role !== message.role) continue;
      if (fuzzyConsumed.has(existing.id)) continue;
      if (existing.text !== message.text) continue;
      if (Math.abs(existing.createdAt - message.createdAt) >= 60_000) continue;
      return existing;
    }
    return null;
  }

  function mergeOne(message: AgentChatMessage) {
    const existingById = byId.get(message.id);
    if (existingById) {
      byId.set(message.id, mergeFields(existingById, message));
      return;
    }
    const fuzzy = findFuzzyTwin(message);
    if (fuzzy) {
      fuzzyConsumed.add(fuzzy.id);
      byId.set(fuzzy.id, mergeFields(fuzzy, message));
      return;
    }
    byId.set(message.id, message);
    order.push(message.id);
  }

  for (const message of [...a, ...b]) {
    mergeOne(message);
  }
  return repairInvertedUserAssistantPairs(
    order
      .map((id) => byId.get(id))
      .filter((message): message is AgentChatMessage => message != null),
  );
}

export function transcriptNeedsRemoteUpdate(
  remote: readonly AgentChatMessage[],
  merged: readonly AgentChatMessage[],
): boolean {
  if (merged.length !== remote.length) return true;
  if (remote.length === 0 && merged.length > 0) return true;
  for (const message of merged) {
    if (!message.activities?.length) continue;
    const remoteMatch = remote.find((entry) => entry.id === message.id);
    if (!(remoteMatch?.activities && remoteMatch.activities.length > 0)) {
      return true;
    }
  }
  return false;
}
