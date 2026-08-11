/**
 * Shared agent chat transcript store (desktop + iPad).
 * Persists under ~/.backsteros/agent-chat-transcripts/<chatId>.json
 * so both clients see the same Chat-tab history for a Cursor chat id.
 *
 * Tool timelines (Read/Edit) are upserted while the turn streams — same idea
 * as T3's projection_thread_activities — so leave/return keeps work rows.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TRANSCRIPT_DIR = path.join(
  os.homedir(),
  ".backsteros",
  "agent-chat-transcripts",
);

/**
 * Prefer the later (more recent) turn-start so stale merges cannot inflate
 * “Working for…” after leave→return.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number | null}
 */
function preferWorkedStartedAt(a, b) {
  const av = typeof a === "number" && Number.isFinite(a) ? a : null;
  const bv = typeof b === "number" && Number.isFinite(b) ? b : null;
  if (av == null) return bv;
  if (bv == null) return av;
  return Math.max(av, bv);
}

/** @typedef {{
 *   id: string,
 *   kind: "tool" | "thought" | "plan" | "info",
 *   title: string,
 *   detail?: string,
 *   status?: "pending" | "in_progress" | "completed" | "failed",
 *   toolKind?: string,
 *   diff?: {
 *     path?: string,
 *     additions: number,
 *     deletions: number,
 *     lines: Array<{ type: "add" | "del" | "ctx", text: string }>,
 *   },
 * }} AgentChatActivityItem */

/** @typedef {{
 *   id: string,
 *   kind: "work",
 *   activities: AgentChatActivityItem[],
 * } | {
 *   id: string,
 *   kind: "text",
 *   text: string,
 * }} AgentChatTurnSegment */

/** @typedef {{
 *   id: string,
 *   role: "user" | "assistant",
 *   text: string,
 *   createdAt: number,
 *   activities?: AgentChatActivityItem[],
 *   segments?: AgentChatTurnSegment[],
 *   planSteps?: Array<{ step: string, status: "completed" | "inProgress" | "pending" }>,
 *   proposedPlanMarkdown?: string,
 *   workedStartedAt?: number | null,
 *   turnId?: string | null,
 *   turnStatus?: "running" | "completed" | "interrupted" | "failed" | null,
 *   turnStartedAt?: number | null,
 *   turnCompletedAt?: number | null,
 *   turnOutcome?: "completed" | "interrupted" | "failed" | null,
 *   gitHeadSha?: string | null,
 *   checkpointPatches?: string[],
 *   checkpointId?: string | null,
 * }} AgentChatMessage */

/** @type {Map<string, AgentChatMessage[]>} */
const memoryByChatId = new Map();

function normalizeChatId(chatId) {
  return typeof chatId === "string" ? chatId.trim().toLowerCase() : "";
}

function filePathForChat(chatId) {
  const id = normalizeChatId(chatId);
  if (!id) return null;
  // chat ids are UUIDs — safe as filenames
  if (!/^[0-9a-f-]{8,}$/i.test(id)) return null;
  return path.join(TRANSCRIPT_DIR, `${id}.json`);
}

function newMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {unknown} raw
 * @returns {AgentChatActivityItem[] | undefined}
 */
function normalizeActivities(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  /** @type {AgentChatActivityItem[]} */
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = /** @type {Record<string, unknown>} */ (entry);
    if (typeof item.id !== "string" || !item.id.trim()) continue;
    if (
      item.kind !== "tool" &&
      item.kind !== "thought" &&
      item.kind !== "plan" &&
      item.kind !== "info"
    ) {
      continue;
    }
    if (typeof item.title !== "string" || !item.title.trim()) continue;
    const status =
      item.status === "pending" ||
      item.status === "in_progress" ||
      item.status === "completed" ||
      item.status === "failed"
        ? item.status
        : undefined;
    /** @type {AgentChatActivityItem["diff"] | undefined} */
    let diff;
    const diffRaw = item.diff;
    if (diffRaw && typeof diffRaw === "object") {
      const d = /** @type {Record<string, unknown>} */ (diffRaw);
      const additions =
        typeof d.additions === "number" && Number.isFinite(d.additions)
          ? d.additions
          : 0;
      const deletions =
        typeof d.deletions === "number" && Number.isFinite(d.deletions)
          ? d.deletions
          : 0;
      const lines = Array.isArray(d.lines)
        ? d.lines
            .map((line) => {
              if (!line || typeof line !== "object") return null;
              const l = /** @type {Record<string, unknown>} */ (line);
              if (l.type !== "add" && l.type !== "del" && l.type !== "ctx") {
                return null;
              }
              if (typeof l.text !== "string") return null;
              return { type: l.type, text: l.text };
            })
            .filter(Boolean)
        : [];
      if (lines.length > 0 || additions > 0 || deletions > 0) {
        diff = {
          path: typeof d.path === "string" ? d.path : undefined,
          additions,
          deletions,
          lines,
        };
      }
    }
    out.push({
      id: item.id.trim(),
      kind: item.kind,
      title: item.title.trim(),
      detail: typeof item.detail === "string" ? item.detail : undefined,
      status,
      toolKind: typeof item.toolKind === "string" ? item.toolKind : undefined,
      ...(diff ? { diff } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * @param {unknown} raw
 * @returns {AgentChatTurnSegment[] | undefined}
 */
function normalizeSegments(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  /** @type {AgentChatTurnSegment[]} */
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = /** @type {Record<string, unknown>} */ (entry);
    if (typeof item.id !== "string" || !item.id.trim()) continue;
    if (item.kind === "text") {
      if (typeof item.text !== "string" || !item.text.trim()) continue;
      out.push({
        id: item.id.trim(),
        kind: "text",
        text: item.text,
      });
      continue;
    }
    if (item.kind === "work") {
      const activities = normalizeActivities(item.activities);
      if (!activities || activities.length === 0) continue;
      out.push({
        id: item.id.trim(),
        kind: "work",
        activities,
      });
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * @param {unknown} raw
 * @returns {AgentChatMessage["planSteps"]}
 */
function normalizePlanSteps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  /** @type {NonNullable<AgentChatMessage["planSteps"]>} */
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = /** @type {Record<string, unknown>} */ (entry);
    const step = typeof item.step === "string" ? item.step.trim() : "";
    if (!step) continue;
    const status =
      item.status === "completed" ||
      item.status === "inProgress" ||
      item.status === "pending"
        ? item.status
        : "pending";
    out.push({ step, status });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * @param {unknown} entry
 * @param {{ allowEmptyAssistantText?: boolean }} [options]
 * @returns {AgentChatMessage | null}
 */
function normalizeMessage(entry, options = {}) {
  if (!entry || typeof entry !== "object") return null;
  const role = /** @type {{ role?: unknown }} */ (entry).role;
  const textRaw = /** @type {{ text?: unknown }} */ (entry).text;
  if (role !== "user" && role !== "assistant") return null;
  if (typeof textRaw !== "string") return null;
  const activities = normalizeActivities(
    /** @type {{ activities?: unknown }} */ (entry).activities,
  );
  const segments = normalizeSegments(
    /** @type {{ segments?: unknown }} */ (entry).segments,
  );
  const text = textRaw.trim();
  const hasTimeline =
    Boolean(activities?.length) || Boolean(segments?.length);
  // In-progress assistant turns may have tools before any reply text.
  if (
    !text &&
    !(
      role === "assistant" &&
      hasTimeline &&
      options.allowEmptyAssistantText === true
    )
  ) {
    return null;
  }
  const idRaw = /** @type {{ id?: unknown }} */ (entry).id;
  const createdRaw = /** @type {{ createdAt?: unknown }} */ (entry).createdAt;
  const planSteps = normalizePlanSteps(
    /** @type {{ planSteps?: unknown }} */ (entry).planSteps,
  );
  const proposedRaw =
    /** @type {{ proposedPlanMarkdown?: unknown }} */ (entry)
      .proposedPlanMarkdown;
  const proposedPlanMarkdown =
    typeof proposedRaw === "string" && proposedRaw.trim()
      ? proposedRaw
      : undefined;
  const workedRaw =
    /** @type {{ workedStartedAt?: unknown }} */ (entry).workedStartedAt;
  const turnIdRaw = /** @type {{ turnId?: unknown }} */ (entry).turnId;
  const turnStatusRaw =
    /** @type {{ turnStatus?: unknown }} */ (entry).turnStatus;
  const turnStartedRaw =
    /** @type {{ turnStartedAt?: unknown }} */ (entry).turnStartedAt;
  const turnCompletedRaw =
    /** @type {{ turnCompletedAt?: unknown }} */ (entry).turnCompletedAt;
  const turnOutcomeRaw =
    /** @type {{ turnOutcome?: unknown }} */ (entry).turnOutcome;
  const gitHeadRaw = /** @type {{ gitHeadSha?: unknown }} */ (entry).gitHeadSha;
  const checkpointIdRaw =
    /** @type {{ checkpointId?: unknown }} */ (entry).checkpointId;
  const checkpointPatchesRaw =
    /** @type {{ checkpointPatches?: unknown }} */ (entry).checkpointPatches;
  const checkpointPatches = Array.isArray(checkpointPatchesRaw)
    ? checkpointPatchesRaw
        .map((entry) => (typeof entry === "string" ? entry : ""))
        .filter((entry) => entry.trim())
    : undefined;
  /** @type {AgentChatMessage} */
  const message = {
    id:
      typeof idRaw === "string" && idRaw.trim()
        ? idRaw.trim()
        : newMessageId(),
    role,
    text,
    createdAt:
      typeof createdRaw === "number" && Number.isFinite(createdRaw)
        ? createdRaw
        : Date.now(),
    ...(activities ? { activities } : {}),
    ...(segments ? { segments } : {}),
    ...(planSteps ? { planSteps } : {}),
    ...(proposedPlanMarkdown ? { proposedPlanMarkdown } : {}),
    ...(typeof workedRaw === "number" && Number.isFinite(workedRaw)
      ? { workedStartedAt: workedRaw }
      : workedRaw === null
        ? { workedStartedAt: null }
        : {}),
    ...(typeof turnIdRaw === "string" && turnIdRaw.trim()
      ? { turnId: turnIdRaw.trim() }
      : {}),
    ...(turnStatusRaw === "running" ||
    turnStatusRaw === "completed" ||
    turnStatusRaw === "interrupted" ||
    turnStatusRaw === "failed"
      ? { turnStatus: turnStatusRaw }
      : {}),
    ...(typeof turnStartedRaw === "number" && Number.isFinite(turnStartedRaw)
      ? { turnStartedAt: turnStartedRaw }
      : {}),
    ...(typeof turnCompletedRaw === "number" &&
    Number.isFinite(turnCompletedRaw)
      ? { turnCompletedAt: turnCompletedRaw }
      : {}),
    ...(turnOutcomeRaw === "completed" ||
    turnOutcomeRaw === "interrupted" ||
    turnOutcomeRaw === "failed"
      ? { turnOutcome: turnOutcomeRaw }
      : {}),
    ...(typeof gitHeadRaw === "string" && gitHeadRaw.trim()
      ? { gitHeadSha: gitHeadRaw.trim() }
      : gitHeadRaw === null
        ? { gitHeadSha: null }
        : {}),
    ...(typeof checkpointIdRaw === "string" && checkpointIdRaw.trim()
      ? { checkpointId: checkpointIdRaw.trim() }
      : {}),
    ...(checkpointPatches && checkpointPatches.length > 0
      ? { checkpointPatches }
      : {}),
  };
  return message;
}

/**
 * Prefer richer timeline fields when merging two assistant turns.
 * @param {AgentChatMessage} existing
 * @param {AgentChatMessage} incoming
 * @returns {AgentChatMessage}
 */
function mergeAssistantTimeline(existing, incoming) {
  const existingActivityCount = existing.activities?.length ?? 0;
  const nextActivityCount = incoming.activities?.length ?? 0;
  const preferNewerActivities = nextActivityCount > existingActivityCount;
  const existingSegmentCount = existing.segments?.length ?? 0;
  const nextSegmentCount = incoming.segments?.length ?? 0;
  const preferNewerSegments = nextSegmentCount > existingSegmentCount;
  const nextText = incoming.text.trim();
  const existingText = existing.text.trim();
  const existingPlanCount = existing.planSteps?.length ?? 0;
  const nextPlanCount = incoming.planSteps?.length ?? 0;
  // Same-length status updates must win (T3 latest snapshot); reject only
  // shorter incoming lists so a stale partial cannot wipe a richer checklist.
  const preferNewerPlans =
    nextPlanCount > 0 && (existingPlanCount === 0 || nextPlanCount >= existingPlanCount);
  return {
    ...existing,
    ...incoming,
    text: nextText || existingText,
    activities: preferNewerActivities
      ? incoming.activities
      : existing.activities ?? incoming.activities,
    segments: preferNewerSegments
      ? incoming.segments
      : existing.segments ?? incoming.segments,
    planSteps: preferNewerPlans
      ? incoming.planSteps
      : existing.planSteps ?? incoming.planSteps,
    proposedPlanMarkdown:
      (typeof incoming.proposedPlanMarkdown === "string" &&
        incoming.proposedPlanMarkdown.trim()) ||
      existing.proposedPlanMarkdown ||
      incoming.proposedPlanMarkdown,
    workedStartedAt: preferWorkedStartedAt(
      existing.workedStartedAt,
      incoming.workedStartedAt,
    ),
    turnId: existing.turnId ?? incoming.turnId ?? null,
    turnStatus:
      incoming.turnStatus === "completed" ||
      incoming.turnStatus === "interrupted" ||
      incoming.turnStatus === "failed"
        ? incoming.turnStatus
        : (existing.turnStatus ?? incoming.turnStatus ?? null),
    turnStartedAt: preferWorkedStartedAt(
      existing.turnStartedAt,
      incoming.turnStartedAt,
    ),
    turnCompletedAt:
      incoming.turnCompletedAt ?? existing.turnCompletedAt ?? null,
    turnOutcome:
      existing.turnOutcome === "interrupted" ||
      incoming.turnOutcome === "interrupted"
        ? "interrupted"
        : (incoming.turnOutcome ?? existing.turnOutcome ?? null),
    gitHeadSha:
      incoming.gitHeadSha !== undefined
        ? incoming.gitHeadSha
        : existing.gitHeadSha,
    checkpointId: existing.checkpointId ?? incoming.checkpointId ?? null,
    checkpointPatches:
      incoming.checkpointPatches ?? existing.checkpointPatches,
    id: existing.id || incoming.id,
    // Prefer later createdAt on seal so Worked-for duration is not "<1s".
    createdAt: Math.max(existing.createdAt, incoming.createdAt),
  };
}

/**
 * @param {string} chatId
 * @returns {AgentChatMessage[]}
 */
export function loadChatTranscript(chatId) {
  const id = normalizeChatId(chatId);
  if (!id) return [];
  const cached = memoryByChatId.get(id);
  if (cached) return cached.map((m) => ({ ...m }));

  const filePath = filePathForChat(id);
  if (!filePath) return [];
  try {
    if (!fs.existsSync(filePath)) {
      memoryByChatId.set(id, []);
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const list = Array.isArray(parsed?.messages)
      ? parsed.messages
      : Array.isArray(parsed)
        ? parsed
        : [];
    /** @type {AgentChatMessage[]} */
    const messages = [];
    for (const entry of list) {
      const msg = normalizeMessage(entry, { allowEmptyAssistantText: true });
      if (msg) messages.push(msg);
    }
    memoryByChatId.set(id, messages);
    return messages.map((m) => ({ ...m }));
  } catch {
    memoryByChatId.set(id, []);
    return [];
  }
}

/**
 * @param {string} chatId
 * @param {readonly AgentChatMessage[]} messages
 */
export function saveChatTranscript(chatId, messages) {
  const id = normalizeChatId(chatId);
  if (!id) return false;
  const filePath = filePathForChat(id);
  if (!filePath) return false;

  /** @type {AgentChatMessage[]} */
  const next = [];
  for (const entry of messages) {
    const msg = normalizeMessage(entry, { allowEmptyAssistantText: true });
    if (msg) next.push(msg);
  }
  memoryByChatId.set(id, next);

  try {
    fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    fs.writeFileSync(
      filePath,
      `${JSON.stringify({ chatId: id, messages: next }, null, 2)}\n`,
      "utf8",
    );
    return true;
  } catch (error) {
    console.warn(
      `[pty] could not persist chat transcript ${id}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * Append a message if it is not an immediate duplicate of the last turn.
 * Never drops a richer activity timeline when a bare text duplicate arrives.
 * @param {string} chatId
 * @param {{
 *   role: "user" | "assistant",
 *   text: string,
 *   id?: string,
 *   createdAt?: number,
 *   activities?: AgentChatActivityItem[],
 *   segments?: AgentChatTurnSegment[],
 *   planSteps?: AgentChatMessage["planSteps"],
 *   proposedPlanMarkdown?: string | null,
 *   workedStartedAt?: number | null,
 * }} input
 * @returns {{ appended: boolean, messages: AgentChatMessage[] }}
 */
export function appendChatTranscriptMessage(chatId, input) {
  const id = normalizeChatId(chatId);
  if (!id) return { appended: false, messages: [] };
  const msg = normalizeMessage(input, { allowEmptyAssistantText: true });
  if (!msg) {
    return { appended: false, messages: loadChatTranscript(id) };
  }

  const current = loadChatTranscript(id);
  const last = current[current.length - 1];

  // Hook afterAgentResponse / stop often appends text-only assistants while the
  // ACP projector already owns a richer open turn. Always fold into the trailing
  // assistant instead of creating a second bubble.
  if (msg.role === "assistant" && last?.role === "assistant") {
    const upgraded = [
      ...current.slice(0, -1),
      mergeAssistantTimeline(last, msg),
    ];
    saveChatTranscript(id, upgraded);
    return { appended: false, messages: upgraded };
  }

  if (
    last &&
    last.role === msg.role &&
    (last.id === msg.id ||
      (last.text === msg.text &&
        Math.abs(last.createdAt - msg.createdAt) < 60_000))
  ) {
    return { appended: false, messages: current };
  }

  const next = [...current, msg];
  saveChatTranscript(id, next);
  return { appended: true, messages: next };
}

/**
 * Upsert the in-progress / finalizing assistant turn timeline (T3-style).
 * Creates a new assistant message when needed; never shrinks a richer timeline.
 * @param {string} chatId
 * @param {{
 *   id?: string,
 *   text?: string,
 *   createdAt?: number,
 *   activities?: AgentChatActivityItem[],
 *   segments?: AgentChatTurnSegment[],
 *   planSteps?: AgentChatMessage["planSteps"],
 *   proposedPlanMarkdown?: string | null,
 *   workedStartedAt?: number | null,
 *   turnId?: string | null,
 *   turnStatus?: AgentChatMessage["turnStatus"],
 *   turnStartedAt?: number | null,
 *   turnCompletedAt?: number | null,
 *   turnOutcome?: AgentChatMessage["turnOutcome"],
 *   checkpointId?: string | null,
 *   gitHeadSha?: string | null,
 *   checkpointPatches?: string[],
 * }} patch
 * @returns {{ messages: AgentChatMessage[], message: AgentChatMessage | null }}
 */
export function upsertAssistantTurnTimeline(chatId, patch) {
  const id = normalizeChatId(chatId);
  if (!id) return { messages: [], message: null };

  const incoming = normalizeMessage(
    {
      role: "assistant",
      text: typeof patch.text === "string" ? patch.text : "",
      id: typeof patch.id === "string" ? patch.id : undefined,
      createdAt:
        typeof patch.createdAt === "number" ? patch.createdAt : Date.now(),
      activities: patch.activities,
      segments: patch.segments,
      planSteps: patch.planSteps,
      proposedPlanMarkdown: patch.proposedPlanMarkdown,
      workedStartedAt: patch.workedStartedAt,
      turnId: patch.turnId,
      turnStatus: patch.turnStatus,
      turnStartedAt: patch.turnStartedAt,
      turnCompletedAt: patch.turnCompletedAt,
      turnOutcome: patch.turnOutcome,
      checkpointId: patch.checkpointId,
      gitHeadSha: patch.gitHeadSha,
      checkpointPatches: patch.checkpointPatches,
    },
    { allowEmptyAssistantText: true },
  );
  if (!incoming) {
    return { messages: loadChatTranscript(id), message: null };
  }

  const current = loadChatTranscript(id);
  const last = current[current.length - 1];
  const patchId =
    typeof patch.id === "string" && patch.id.trim() ? patch.id.trim() : null;

  if (last?.role === "assistant") {
    const sameTurn =
      (patchId && last.id === patchId) ||
      (!patchId &&
        (Boolean(last.activities?.length) ||
          Boolean(last.segments?.length) ||
          !last.text.trim() ||
          (incoming.text && last.text === incoming.text)));
    if (sameTurn) {
      const merged = mergeAssistantTimeline(last, incoming);
      const next = [...current.slice(0, -1), merged];
      saveChatTranscript(id, next);
      return { messages: next, message: merged };
    }
  }

  // Prefer matching by explicit id deeper in the list (rare remount race).
  if (patchId) {
    const index = current.findIndex((entry) => entry.id === patchId);
    if (index >= 0 && current[index]?.role === "assistant") {
      const merged = mergeAssistantTimeline(current[index], incoming);
      const next = [...current.slice(0, index), merged, ...current.slice(index + 1)];
      saveChatTranscript(id, next);
      return { messages: next, message: merged };
    }
  }

  // T3 / client parity: never append an assistant turn without a trailing user
  // prompt — otherwise the reply can land above (or hide) the user's message.
  if (last?.role !== "user") {
    return { messages: current, message: null };
  }

  const next = [...current, incoming];
  saveChatTranscript(id, next);
  return { messages: next, message: incoming };
}

/**
 * Extract a user prompt from a Cursor beforeSubmitPrompt hook payload.
 * @param {unknown} payload
 * @returns {string | null}
 */
export function extractHookUserPrompt(payload) {
  if (!payload || typeof payload !== "object") return null;
  const p = /** @type {Record<string, unknown>} */ (payload);
  const candidates = [
    p.prompt,
    p.text,
    p.message,
    p.user_prompt,
    p.userPrompt,
    p.content,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
