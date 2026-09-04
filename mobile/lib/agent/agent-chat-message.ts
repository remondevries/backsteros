import {
  normalizeActivities,
  normalizePlanSteps,
  normalizeSegments,
  type AgentChatActivityItem,
  type AgentChatPlanStep,
  type AgentChatTurnSegment,
} from "./agent-chat-activity";
import { randomUuid } from "../random-uuid";

export type AgentChatRole = "user" | "assistant";

export type AgentChatTurnOutcome = "completed" | "interrupted" | "failed";
export type AgentChatTurnStatus =
  | "running"
  | "completed"
  | "interrupted"
  | "failed";

export type AgentChatMessage = {
  id: string;
  role: AgentChatRole;
  text: string;
  createdAt: number;
  activities?: AgentChatActivityItem[];
  segments?: AgentChatTurnSegment[];
  planSteps?: AgentChatPlanStep[];
  proposedPlanMarkdown?: string | null;
  workedStartedAt?: number | null;
  turnId?: string | null;
  turnStatus?: AgentChatTurnStatus | null;
  turnStartedAt?: number | null;
  turnCompletedAt?: number | null;
  turnOutcome?: AgentChatTurnOutcome | null;
};

function newMessageId(): string {
  return randomUuid();
}

/** Normalize sidecar / local JSON into a typed message (preserves activities). */
export function normalizeAgentChatMessage(
  entry: unknown,
): AgentChatMessage | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (raw.role !== "user" && raw.role !== "assistant") return null;
  if (typeof raw.text !== "string") return null;
  if (typeof raw.createdAt !== "number" || !Number.isFinite(raw.createdAt)) {
    return null;
  }
  const proposedPlanMarkdown =
    typeof raw.proposedPlanMarkdown === "string" &&
    raw.proposedPlanMarkdown.trim()
      ? raw.proposedPlanMarkdown
      : undefined;
  return {
    id: raw.id.trim(),
    role: raw.role,
    text: raw.text,
    createdAt: raw.createdAt,
    activities: normalizeActivities(raw.activities),
    segments: normalizeSegments(raw.segments),
    planSteps: normalizePlanSteps(raw.planSteps),
    ...(proposedPlanMarkdown ? { proposedPlanMarkdown } : {}),
    workedStartedAt:
      typeof raw.workedStartedAt === "number" &&
      Number.isFinite(raw.workedStartedAt)
        ? raw.workedStartedAt
        : undefined,
    turnId:
      typeof raw.turnId === "string" && raw.turnId.trim()
        ? raw.turnId.trim()
        : undefined,
    turnStatus:
      raw.turnStatus === "running" ||
      raw.turnStatus === "completed" ||
      raw.turnStatus === "interrupted" ||
      raw.turnStatus === "failed"
        ? raw.turnStatus
        : undefined,
    turnStartedAt:
      typeof raw.turnStartedAt === "number" && Number.isFinite(raw.turnStartedAt)
        ? raw.turnStartedAt
        : undefined,
    turnCompletedAt:
      typeof raw.turnCompletedAt === "number" &&
      Number.isFinite(raw.turnCompletedAt)
        ? raw.turnCompletedAt
        : undefined,
    turnOutcome:
      raw.turnOutcome === "interrupted" ||
      raw.turnOutcome === "completed" ||
      raw.turnOutcome === "failed"
        ? raw.turnOutcome
        : undefined,
  };
}

export function createAgentChatMessage(
  role: AgentChatRole,
  text: string,
): AgentChatMessage {
  return {
    id: newMessageId(),
    role,
    text: text.trim(),
    createdAt: Date.now(),
  };
}

export function parseTranscriptMessages(raw: unknown): AgentChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeAgentChatMessage(entry))
    .filter((entry): entry is AgentChatMessage => entry != null);
}
