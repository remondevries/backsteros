/**
 * Shared agent chat transcript store (desktop + iPad).
 * Persists under ~/.backsteros/agent-chat-transcripts/<chatId>.json
 * so both clients see the same Chat-tab history for a Cursor chat id.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TRANSCRIPT_DIR = path.join(
  os.homedir(),
  ".backsteros",
  "agent-chat-transcripts",
);

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
 *   role: "user" | "assistant",
 *   text: string,
 *   createdAt: number,
 *   activities?: AgentChatActivityItem[],
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
 * @param {unknown} entry
 * @returns {AgentChatMessage | null}
 */
function normalizeMessage(entry) {
  if (!entry || typeof entry !== "object") return null;
  const role = /** @type {{ role?: unknown }} */ (entry).role;
  const text = /** @type {{ text?: unknown }} */ (entry).text;
  if (role !== "user" && role !== "assistant") return null;
  if (typeof text !== "string" || !text.trim()) return null;
  const idRaw = /** @type {{ id?: unknown }} */ (entry).id;
  const createdRaw = /** @type {{ createdAt?: unknown }} */ (entry).createdAt;
  const activities = normalizeActivities(
    /** @type {{ activities?: unknown }} */ (entry).activities,
  );
  return {
    id:
      typeof idRaw === "string" && idRaw.trim()
        ? idRaw.trim()
        : newMessageId(),
    role,
    text: text.trim(),
    createdAt:
      typeof createdRaw === "number" && Number.isFinite(createdRaw)
        ? createdRaw
        : Date.now(),
    ...(activities ? { activities } : {}),
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
      const msg = normalizeMessage(entry);
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
    const msg = normalizeMessage(entry);
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
 * @param {string} chatId
 * @param {{
 *   role: "user" | "assistant",
 *   text: string,
 *   id?: string,
 *   createdAt?: number,
 *   activities?: AgentChatActivityItem[],
 * }} input
 * @returns {{ appended: boolean, messages: AgentChatMessage[] }}
 */
export function appendChatTranscriptMessage(chatId, input) {
  const id = normalizeChatId(chatId);
  if (!id) return { appended: false, messages: [] };
  const msg = normalizeMessage(input);
  if (!msg) {
    return { appended: false, messages: loadChatTranscript(id) };
  }

  const current = loadChatTranscript(id);
  const last = current[current.length - 1];
  if (
    last &&
    last.role === msg.role &&
    last.text === msg.text &&
    Math.abs(last.createdAt - msg.createdAt) < 60_000
  ) {
    // Upgrade a duplicate assistant turn with activities if the first write
    // arrived without the timeline (race with streaming finalize).
    if (
      msg.role === "assistant" &&
      msg.activities?.length &&
      !(last.activities && last.activities.length > 0)
    ) {
      const upgraded = [...current.slice(0, -1), { ...last, activities: msg.activities }];
      saveChatTranscript(id, upgraded);
      return { appended: false, messages: upgraded };
    }
    return { appended: false, messages: current };
  }

  const next = [...current, msg];
  saveChatTranscript(id, next);
  return { appended: true, messages: next };
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
