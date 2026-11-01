/**
 * Read Cursor IDE agent transcripts from
 * `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl`.
 *
 * Emits ChatUi-shaped messages (`text` + `tool-call` parts) so the desktop
 * Process → UI pane can reuse ChatThread chrome.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { cursorProjectSlug } from "./agent-acp-mcp.mjs";

/**
 * @param {string} cwd
 */
export function cursorAgentTranscriptsDir(cwd) {
  return path.join(
    os.homedir(),
    ".cursor",
    "projects",
    cursorProjectSlug(cwd),
    "agent-transcripts",
  );
}

/**
 * @param {string} conversationId
 * @returns {string | null}
 */
export function resolveCursorAgentTranscriptPath(conversationId) {
  const id = conversationId?.trim();
  if (!id) return null;
  const projectsRoot = path.join(os.homedir(), ".cursor", "projects");
  try {
    for (const project of fs.readdirSync(projectsRoot)) {
      const candidate = path.join(
        projectsRoot,
        project,
        "agent-transcripts",
        id,
        `${id}.jsonl`,
      );
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} transcriptsRoot
 * @returns {{ conversationId: string, path: string, mtimeMs: number } | null}
 */
function newestTranscriptUnder(transcriptsRoot) {
  if (!fs.existsSync(transcriptsRoot)) return null;
  /** @type {{ conversationId: string, path: string, mtimeMs: number } | null} */
  let best = null;
  let entries = [];
  try {
    entries = fs.readdirSync(transcriptsRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const conversationId = entry.name;
    const filePath = path.join(
      transcriptsRoot,
      conversationId,
      `${conversationId}.jsonl`,
    );
    try {
      const stat = fs.statSync(filePath);
      if (!best || stat.mtimeMs > best.mtimeMs) {
        best = { conversationId, path: filePath, mtimeMs: stat.mtimeMs };
      }
    } catch {
      /* skip missing */
    }
  }
  return best;
}

/**
 * Prefer the newest transcript for `cwd`'s Cursor project; if none, the newest
 * across all local Cursor projects (so an IDE chat in the monorepo still
 * surfaces when the task cwd is a nested app folder).
 *
 * @param {{ cwd?: string | null, conversationId?: string | null }} [options]
 */
export function findCursorAgentTranscript(options = {}) {
  const conversationId = options.conversationId?.trim() || null;
  if (conversationId) {
    const filePath = resolveCursorAgentTranscriptPath(conversationId);
    if (!filePath) return null;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(filePath).mtimeMs;
    } catch {
      return null;
    }
    return { conversationId, path: filePath, mtimeMs };
  }

  const cwd = options.cwd?.trim() || null;
  if (cwd) {
    const local = newestTranscriptUnder(cursorAgentTranscriptsDir(cwd));
    if (local) return local;
  }

  const projectsRoot = path.join(os.homedir(), ".cursor", "projects");
  /** @type {{ conversationId: string, path: string, mtimeMs: number } | null} */
  let best = null;
  try {
    for (const project of fs.readdirSync(projectsRoot)) {
      const candidate = newestTranscriptUnder(
        path.join(projectsRoot, project, "agent-transcripts"),
      );
      if (candidate && (!best || candidate.mtimeMs > best.mtimeMs)) {
        best = candidate;
      }
    }
  } catch {
    return null;
  }
  return best;
}

/**
 * @param {string} text
 */
export function cleanCursorTranscriptText(text) {
  const raw = String(text ?? "");
  const query = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (query?.[1]) return query[1].trim();
  return raw
    .replace(/<timestamp>[\s\S]*?<\/timestamp>\s*/gi, "")
    .replace(/<\/?user_query>/gi, "")
    .trim();
}

/**
 * @typedef {{ type: "text", text: string, markdown?: boolean }} CursorTextPart
 * @typedef {{
 *   type: "tool-call",
 *   id?: string,
 *   name: string,
 *   input?: unknown,
 *   output?: unknown,
 *   status?: "pending" | "running" | "done" | "error",
 * }} CursorToolCallPart
 * @typedef {CursorTextPart | CursorToolCallPart} CursorMessagePart
 * @typedef {{ role: "user" | "assistant", parts: CursorMessagePart[] }} CursorTranscriptMessage
 */

/**
 * @param {unknown} content
 * @param {"user" | "assistant"} role
 * @returns {CursorMessagePart[]}
 */
export function extractCursorContentParts(content, role) {
  /** @type {CursorMessagePart[]} */
  const parts = [];
  if (typeof content === "string") {
    const text = cleanCursorTranscriptText(content);
    if (text) {
      parts.push({
        type: "text",
        text,
        markdown: role === "assistant",
      });
    }
    return parts;
  }
  if (!Array.isArray(content)) return parts;

  let toolIndex = 0;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const record = /** @type {Record<string, unknown>} */ (part);
    if (record.type === "text" && typeof record.text === "string") {
      const text = cleanCursorTranscriptText(record.text);
      if (!text) continue;
      parts.push({
        type: "text",
        text,
        markdown: role === "assistant",
      });
      continue;
    }
    if (record.type === "tool_use" || record.type === "tool-call") {
      const name =
        typeof record.name === "string" && record.name.trim()
          ? record.name.trim()
          : "tool";
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : `tool-${toolIndex}`;
      toolIndex += 1;
      /** @type {CursorToolCallPart} */
      const toolPart = {
        type: "tool-call",
        id,
        name,
        status: "done",
      };
      if ("input" in record) toolPart.input = record.input;
      if ("output" in record) toolPart.output = record.output;
      parts.push(toolPart);
    }
  }
  return parts;
}

/**
 * @param {CursorMessagePart[]} left
 * @param {CursorMessagePart[]} right
 * @returns {CursorMessagePart[]}
 */
export function mergeCursorMessageParts(left, right) {
  if (left.length === 0) return right.slice();
  if (right.length === 0) return left.slice();
  const last = left[left.length - 1];
  const first = right[0];
  if (
    last &&
    first &&
    last.type === "text" &&
    first.type === "text"
  ) {
    return [
      ...left.slice(0, -1),
      {
        type: "text",
        text: `${last.text}\n\n${first.text}`.trim(),
        markdown: Boolean(last.markdown || first.markdown),
      },
      ...right.slice(1),
    ];
  }
  return [...left, ...right];
}

/**
 * @param {string} line
 * @returns {CursorTranscriptMessage | null}
 */
export function parseCursorTranscriptLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let entry;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!entry || typeof entry !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (entry);

  if (record.type === "assistant.message" && record.data) {
    const data = /** @type {Record<string, unknown>} */ (record.data);
    const parts = extractCursorContentParts(data.content, "assistant");
    return parts.length > 0 ? { role: "assistant", parts } : null;
  }

  const message =
    record.message && typeof record.message === "object"
      ? /** @type {Record<string, unknown>} */ (record.message)
      : null;
  const roleRaw =
    (typeof record.role === "string" && record.role) ||
    (message && typeof message.role === "string" && message.role) ||
    null;
  if (roleRaw !== "user" && roleRaw !== "assistant") return null;

  const content = message?.content ?? record.content;
  const parts = extractCursorContentParts(content, roleRaw);
  if (parts.length === 0) return null;
  return { role: roleRaw, parts };
}

/**
 * @param {string} filePath
 * @returns {CursorTranscriptMessage[]}
 */
export function readCursorAgentTranscriptMessages(filePath) {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  /** @type {CursorTranscriptMessage[]} */
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseCursorTranscriptLine(line);
    if (!parsed) continue;
    const prev = out[out.length - 1];
    // Merge consecutive same-role chunks from a single turn.
    if (prev && prev.role === parsed.role) {
      prev.parts = mergeCursorMessageParts(prev.parts, parsed.parts);
      continue;
    }
    out.push({ role: parsed.role, parts: parsed.parts.slice() });
  }
  return out;
}

/**
 * @param {{ cwd?: string | null, conversationId?: string | null }} [options]
 */
export function loadCursorAgentTranscript(options = {}) {
  const found = findCursorAgentTranscript(options);
  if (!found) {
    return {
      ok: false,
      error: "No Cursor agent transcript found for this workspace.",
      conversationId: null,
      path: null,
      mtimeMs: 0,
      messages: [],
    };
  }
  const messages = readCursorAgentTranscriptMessages(found.path);
  return {
    ok: true,
    error: null,
    conversationId: found.conversationId,
    path: found.path,
    mtimeMs: found.mtimeMs,
    messages,
  };
}
