/**
 * Server-side ACP turn projector (T3-style).
 *
 * Provider runtime events are persisted into the transcript store keyed by
 * chatId, independent of which task the UI is viewing. Switching chats does
 * not stop projection for background sessions.
 */
import { upsertAssistantTurnTimeline } from "./agent-chat-transcript-store.mjs";
import { stripTransientAgentStreamError } from "./agent-stream-errors.mjs";

/**
 * @typedef {{
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
 * }} Activity
 *
 * @typedef {{
 *   id: string,
 *   kind: "work",
 *   activities: Activity[],
 * } | {
 *   id: string,
 *   kind: "text",
 *   text: string,
 * }} Segment
 *
 * @typedef {{
 *   taskId: string,
 *   chatId: string,
 *   messageId: string,
 *   workedStartedAt: number,
 *   activities: Activity[],
 *   segments: Segment[],
 *   assistantDraft: string,
 *   planSteps: Array<{ step: string, status: "completed" | "inProgress" | "pending" }>,
 *   proposedPlanMarkdown: string | null,
 *   dirty: boolean,
 * }} LiveTurn
 */

/** @type {Map<string, LiveTurn>} taskId → live turn */
const liveByTaskId = new Map();

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const flushTimers = new Map();

const THOUGHT_ID = "acp-thought-stream";
const PLAN_ID = "acp-plan";

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function emptyTurn(taskId, chatId) {
  return {
    taskId,
    chatId,
    messageId: newId("asst"),
    workedStartedAt: Date.now(),
    activities: [],
    segments: [],
    assistantDraft: "",
    planSteps: [],
    proposedPlanMarkdown: null,
    /** @type {Record<string, Activity>} */
    pendingTools: {},
    /** @type {Record<string, Record<string, unknown>>} */
    toolCallPayloads: {},
    dirty: false,
  };
}

/**
 * @param {Segment[]} segments
 * @returns {Activity[]}
 */
function activitiesFromSegments(segments) {
  /** @type {Activity[]} */
  const out = [];
  for (const segment of segments) {
    if (segment.kind === "work") out.push(...segment.activities);
  }
  return out;
}

/**
 * @param {Segment[]} segments
 */
function assistantDraftFromSegments(segments) {
  return segments
    .filter((s) => s.kind === "text")
    .map((s) => (s.kind === "text" ? s.text : ""))
    .join("");
}

/**
 * @param {Segment[]} segments
 * @param {Activity} item
 */
function upsertActivityInSegments(segments, item) {
  const next = segments.map((segment) =>
    segment.kind === "work"
      ? {
          ...segment,
          activities: segment.activities.map((a) => ({ ...a })),
        }
      : { ...segment },
  );

  for (let i = next.length - 1; i >= 0; i -= 1) {
    const segment = next[i];
    if (!segment || segment.kind !== "work") continue;
    const idx = segment.activities.findIndex((a) => a.id === item.id);
    if (idx >= 0) {
      const prev = segment.activities[idx];
      segment.activities[idx] = {
        ...prev,
        ...item,
        title: item.title || prev.title,
        detail: item.detail ?? prev.detail,
        status: item.status ?? prev.status,
        toolKind: item.toolKind ?? prev.toolKind,
        diff: item.diff ?? prev.diff,
      };
      return next;
    }
  }

  const last = next[next.length - 1];
  if (last?.kind === "work") {
    last.activities.push(item);
    return next;
  }
  next.push({ id: newId("work"), kind: "work", activities: [item] });
  return next;
}

/**
 * @param {Segment[]} segments
 * @param {string} chunk
 */
function appendAssistantTextChunk(segments, chunk) {
  const next = segments.map((segment) =>
    segment.kind === "text" ? { ...segment } : {
      ...segment,
      activities: segment.activities.map((a) => ({ ...a })),
    },
  );
  const last = next[next.length - 1];
  if (last?.kind === "text") {
    last.text += chunk;
    return next;
  }
  next.push({ id: newId("text"), kind: "text", text: chunk });
  return next;
}

/**
 * @param {unknown} update
 * @returns {string}
 */
function messageChunkText(update) {
  if (!update || typeof update !== "object") return "";
  const u = /** @type {Record<string, unknown>} */ (update);
  const content = u.content;
  if (content && typeof content === "object") {
    const text = /** @type {{ text?: unknown }} */ (content).text;
    if (typeof text === "string") return text;
  }
  return typeof u.text === "string" ? u.text : "";
}

/**
 * @param {unknown} update
 */
function thoughtText(update) {
  return messageChunkText(update);
}

/**
 * @param {unknown} status
 * @returns {Activity["status"] | undefined}
 */
function parseStatus(status) {
  if (status === "pending" || status === "in_progress" || status === "completed" || status === "failed") {
    return status;
  }
  if (status === "completed" || status === "complete") return "completed";
  if (status === "failed" || status === "error") return "failed";
  if (status === "in_progress" || status === "running") return "in_progress";
  return undefined;
}

/**
 * @param {LiveTurn} turn
 */
function persistTurn(turn) {
  upsertAssistantTurnTimeline(turn.chatId, {
    id: turn.messageId,
    text: stripTransientAgentStreamError(turn.assistantDraft),
    createdAt: turn.workedStartedAt,
    activities: turn.activities,
    segments: turn.segments,
    planSteps: turn.planSteps.length > 0 ? turn.planSteps : undefined,
    proposedPlanMarkdown: turn.proposedPlanMarkdown,
    workedStartedAt: turn.workedStartedAt,
  });
  turn.dirty = false;
}

/**
 * @param {string} taskId
 */
function schedulePersist(taskId) {
  const existing = flushTimers.get(taskId);
  if (existing) clearTimeout(existing);
  flushTimers.set(
    taskId,
    setTimeout(() => {
      flushTimers.delete(taskId);
      const turn = liveByTaskId.get(taskId);
      if (turn?.dirty) persistTurn(turn);
    }, 100),
  );
}

/**
 * @param {string} taskId
 * @param {string} chatId
 */
export function beginAcpProjectedTurn(taskId, chatId) {
  const id = taskId.trim();
  const cid = chatId.trim().toLowerCase();
  if (!id || !cid) return null;
  const turn = emptyTurn(id, cid);
  liveByTaskId.set(id, turn);
  turn.dirty = true;
  schedulePersist(id);
  return turn;
}

/** Strip trailing "complete(d)" suffixes Cursor sometimes appends. */
function normalizeCompactToolLabel(value) {
  return String(value ?? "")
    .replace(/\s+(?:complete|completed)\s*$/i, "")
    .trim();
}

function capitalizePhrase(value) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function isGenericToolTitle(value) {
  const lower = normalizeCompactToolLabel(value ?? "").toLowerCase();
  if (!lower) return true;
  return (
    lower === "tool" ||
    lower === "tool call" ||
    lower === "tool_call" ||
    lower === "calling tool" ||
    lower === "running tool" ||
    lower === "function" ||
    lower === "function call"
  );
}

/** Short TUI-style verb (T3 work-entry labels). */
function toolKindVerb(toolKind) {
  if (!toolKind) return undefined;
  const lower = toolKind.toLowerCase();
  if (lower === "read") return "Read";
  if (lower === "edit" || lower === "write") return "Edited";
  if (lower === "execute" || lower === "shell") return "Ran";
  if (lower === "search" || lower === "grep" || lower === "glob") return "Grepped";
  if (lower === "delete") return "Deleted";
  if (lower === "move") return "Moved";
  if (lower === "fetch") return "Fetched";
  if (lower === "think") return "Thought";
  return capitalizePhrase(lower);
}

function truncateDetail(value, max = 72) {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length > max ? `${oneLine.slice(0, max - 3)}…` : oneLine;
}

function formatPathForDetail(filePath, max = 64) {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return truncateDetail(normalized, max);
  if (parts.length <= 3) return truncateDetail(parts.join("/"), max);
  return truncateDetail(parts.slice(-3).join("/"), max);
}

function maybePathLike(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.startsWith(".") ||
    /\.(?:[a-z0-9]{1,16})$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} input
 * @param {...string} keys
 */
function stringField(input, ...keys) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function quoteSearchQuery(query) {
  const truncated = truncateDetail(query);
  if (!truncated) return "";
  return truncated.includes(" ") || truncated.includes('"')
    ? truncated
    : `"${truncated}"`;
}

function coerceRawInput(raw, toolKind) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return /** @type {Record<string, unknown>} */ (parsed);
      }
    } catch {
      if (maybePathLike(trimmed) || trimmed.includes("*")) {
        return { path: trimmed };
      }
      const kind = String(toolKind ?? "").toLowerCase();
      if (
        kind.includes("search") ||
        kind.includes("grep") ||
        kind.includes("glob") ||
        kind.includes("find")
      ) {
        return { pattern: trimmed };
      }
      return null;
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  return null;
}

/**
 * T3 mergeToolCallState data merge — keep rawInput/locations across patches.
 * Empty content arrays must not wipe a prior diff payload.
 * @param {Record<string, unknown> | undefined} previous
 * @param {Record<string, unknown>} update
 */
function mergeToolCallPayload(previous, update) {
  /** @type {Record<string, unknown>} */
  const merged = { ...(previous ?? {}) };
  for (const key of ["toolCallId", "sessionUpdate", "title", "kind", "status"]) {
    const value = update[key];
    if (typeof value === "string" && value.trim()) {
      merged[key] = value.trim();
    }
  }
  for (const key of [
    "rawInput",
    "input",
    "arguments",
    "args",
    "locations",
    "rawOutput",
  ]) {
    if (update[key] !== undefined && update[key] !== null) {
      merged[key] = update[key];
    }
  }
  if (update.content !== undefined && update.content !== null) {
    const nextContent = update.content;
    const prevContent = merged.content;
    const nextEmpty = Array.isArray(nextContent) && nextContent.length === 0;
    const prevHasItems = Array.isArray(prevContent) && prevContent.length > 0;
    if (!(nextEmpty && prevHasItems)) {
      merged.content = nextContent;
    }
  }
  return merged;
}

/**
 * Lightweight line diff for activity previews (mirrors desktop agent-acp-activity).
 * @param {string | null | undefined} oldText
 * @param {string | null | undefined} newText
 * @param {string | null | undefined} [path]
 * @returns {Activity["diff"] | undefined}
 */
function buildActivityDiffPreview(oldText, newText, path) {
  const before = typeof oldText === "string" ? oldText : "";
  const after = typeof newText === "string" ? newText : "";
  if (!before && !after) return undefined;

  /** @param {string} text */
  const splitLines = (text) => {
    if (!text) return /** @type {string[]} */ ([]);
    const parts = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return parts;
  };

  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  let start = 0;
  while (
    start < oldLines.length &&
    start < newLines.length &&
    oldLines[start] === newLines[start]
  ) {
    start += 1;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldLines[oldEnd - 1] === newLines[newEnd - 1]
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  /** @type {NonNullable<Activity["diff"]>["lines"]} */
  const lines = [];
  const ctxBefore = Math.min(2, start);
  for (let i = start - ctxBefore; i < start; i += 1) {
    lines.push({ type: "ctx", text: oldLines[i] ?? "" });
  }
  for (let i = start; i < oldEnd; i += 1) {
    lines.push({ type: "del", text: oldLines[i] ?? "" });
  }
  for (let i = start; i < newEnd; i += 1) {
    lines.push({ type: "add", text: newLines[i] ?? "" });
  }
  const ctxAfter = Math.min(2, oldLines.length - oldEnd);
  for (let i = oldEnd; i < oldEnd + ctxAfter; i += 1) {
    lines.push({ type: "ctx", text: oldLines[i] ?? "" });
  }

  const additions = lines.filter((line) => line.type === "add").length;
  const deletions = lines.filter((line) => line.type === "del").length;
  if (additions === 0 && deletions === 0) return undefined;

  const MAX = 400;
  let preview = lines;
  if (preview.length > MAX) {
    preview = [
      ...preview.slice(0, MAX - 1),
      { type: "ctx", text: `… ${preview.length - (MAX - 1)} more lines` },
    ];
  }

  return {
    path: path?.trim() ? path.trim() : undefined,
    additions,
    deletions,
    lines: preview,
  };
}

/**
 * @param {string} patchText
 * @returns {NonNullable<Activity["diff"]>["lines"]}
 */
function linesFromUnifiedPatch(patchText) {
  /** @type {NonNullable<Activity["diff"]>["lines"]} */
  const lines = [];
  for (const raw of patchText.replace(/\r\n/g, "\n").split("\n")) {
    if (
      raw.startsWith("diff --git") ||
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("@@")
    ) {
      continue;
    }
    if (raw.startsWith("+")) {
      lines.push({ type: "add", text: raw.slice(1) });
    } else if (raw.startsWith("-")) {
      lines.push({ type: "del", text: raw.slice(1) });
    } else if (raw.startsWith(" ") || raw === "") {
      lines.push({
        type: "ctx",
        text: raw.startsWith(" ") ? raw.slice(1) : "",
      });
    }
  }
  return lines;
}

/**
 * @param {Record<string, unknown>} update
 * @returns {Activity["diff"] | undefined}
 */
function toolDiffFromUpdate(update) {
  const content = update.content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = /** @type {Record<string, unknown>} */ (block);
    if (b.type !== "diff") continue;
    const path =
      typeof b.path === "string"
        ? b.path
        : typeof b.file === "string"
          ? b.file
          : undefined;
    const oldText =
      typeof b.oldText === "string"
        ? b.oldText
        : typeof b.old_text === "string"
          ? b.old_text
          : null;
    const newText =
      typeof b.newText === "string"
        ? b.newText
        : typeof b.new_text === "string"
          ? b.new_text
          : null;
    const fromTexts = buildActivityDiffPreview(oldText, newText, path);
    if (fromTexts) return fromTexts;

    let patchText = "";
    const patch = b.patch;
    if (patch && typeof patch === "object") {
      const p = /** @type {Record<string, unknown>} */ (patch);
      if (typeof p.text === "string" && p.text.trim()) patchText = p.text;
      else if (typeof p.diff === "string" && p.diff.trim()) patchText = p.diff;
    }
    if (!patchText && typeof b.text === "string" && b.text.includes("@@")) {
      patchText = b.text;
    }
    if (!patchText && typeof b.unifiedDiff === "string") {
      patchText = b.unifiedDiff;
    }
    if (!patchText.trim()) continue;
    const lines = linesFromUnifiedPatch(patchText);
    if (lines.length === 0) continue;
    const additions = lines.filter((line) => line.type === "add").length;
    const deletions = lines.filter((line) => line.type === "del").length;
    if (additions === 0 && deletions === 0) continue;
    return {
      path: path?.trim() || undefined,
      additions,
      deletions,
      lines,
    };
  }
  return undefined;
}

/**
 * @param {unknown} value
 * @param {string[]} paths
 * @param {Set<string>} seen
 * @param {number} depth
 */
function collectPathsFromValue(value, paths, seen, depth) {
  if (depth > 5 || paths.length >= 8) return;
  if (typeof value === "string") {
    const candidate = maybePathLike(value.trim());
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      paths.push(candidate);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromValue(entry, paths, seen, depth + 1);
      if (paths.length >= 8) return;
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = /** @type {Record<string, unknown>} */ (value);

  for (const key of [
    "path",
    "file_path",
    "filePath",
    "target_file",
    "targetFile",
    "relativePath",
    "filename",
    "file",
    "newPath",
    "oldPath",
    "uri",
  ]) {
    const raw = stringField(record, key);
    if (!raw) continue;
    const candidate =
      maybePathLike(raw) ??
      (key === "uri" && raw.startsWith("file:")
        ? maybePathLike(raw.replace(/^file:\/\//, ""))
        : null);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    paths.push(candidate);
    if (paths.length >= 8) return;
  }

  for (const nestedKey of [
    "locations",
    "item",
    "input",
    "result",
    "rawInput",
    "arguments",
    "args",
    "data",
    "changes",
    "content",
  ]) {
    if (!(nestedKey in record)) continue;
    collectPathsFromValue(record[nestedKey], paths, seen, depth + 1);
    if (paths.length >= 8) return;
  }
}

const TOOL_TITLE_VERB_RE =
  /^(reading|read(?:\s+file)?|grepping|grep(?:ping)?|searching|search|glob(?:bing)?|find(?:ing)?|editing|edit(?:ing)?|writing|write|deleting|delete|moving|move|fetching|fetch|running|ran|terminal|bash|shell)\b(?:\s+|$)(.*)$/i;

/**
 * Split Cursor titles like "Reading src/app.ts" into verb + detail (T3-style).
 * @param {string} titleFromAgent
 */
function peelToolTitle(titleFromAgent) {
  const compact = normalizeCompactToolLabel(titleFromAgent);
  if (!compact) return { title: "" };
  const match = TOOL_TITLE_VERB_RE.exec(compact);
  if (!match) return { title: compact };
  const verb = match[1] ?? compact;
  const rest = (match[2] ?? "").trim();
  if (!rest) return { title: verb };
  const unquoted = rest
    .replace(/^`([^`]+)`$/, "$1")
    .replace(/^"([^"]+)"$/, "$1")
    .replace(/^'([^']+)'$/, "$1")
    .trim();
  if (!unquoted) return { title: verb };
  const pathLike = maybePathLike(unquoted);
  return {
    title: verb,
    detailHint: pathLike
      ? formatPathForDetail(pathLike)
      : truncateDetail(unquoted),
  };
}

/**
 * @param {string} titleFromAgent
 * @param {string | undefined} toolKind
 */
function presentToolTitle(titleFromAgent, toolKind) {
  const kindLabel = toolKindVerb(toolKind);
  const compact = normalizeCompactToolLabel(titleFromAgent);
  if (!compact || isGenericToolTitle(compact)) return kindLabel || "Tool";
  const lower = compact.toLowerCase();
  if (
    kindLabel &&
    (lower === "write" ||
      lower === "writing" ||
      lower === "edit" ||
      lower === "editing" ||
      lower === "read" ||
      lower === "reading" ||
      lower === "read file" ||
      lower === "terminal" ||
      lower === "bash" ||
      lower === "shell" ||
      lower === "grep" ||
      lower === "grepping" ||
      lower === "find" ||
      lower === "finding" ||
      lower === "search" ||
      lower === "searching" ||
      lower === "glob" ||
      lower === "globbing" ||
      lower === "tool")
  ) {
    return kindLabel;
  }
  return compact;
}

/**
 * First useful text line from ACP tool content (e.g. "No files found").
 * @param {unknown} content
 */
function extractToolContentText(content) {
  if (typeof content === "string" && content.trim()) {
    return truncateDetail(content.trim(), 120);
  }
  if (!Array.isArray(content)) return null;
  /** @type {string[]} */
  const chunks = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const e = /** @type {Record<string, unknown>} */ (entry);
    if (e.type === "content" && e.content && typeof e.content === "object") {
      const nested = /** @type {Record<string, unknown>} */ (e.content);
      if (typeof nested.text === "string" && nested.text.trim()) {
        chunks.push(nested.text.trim());
      }
      continue;
    }
    if (typeof e.text === "string" && e.text.trim()) {
      chunks.push(e.text.trim());
    }
  }
  if (chunks.length === 0) return null;
  return truncateDetail(chunks.join("\n"), 120);
}

/**
 * T3-style tool detail from rawInput / locations / content.
 * @param {Record<string, unknown>} update
 * @param {string | undefined} toolKind
 */
function toolDetailFromUpdate(update, toolKind) {
  const kind = (toolKind ?? "").toLowerCase();
  const prefersSearch =
    kind.includes("search") ||
    kind.includes("grep") ||
    kind.includes("glob") ||
    kind.includes("find");

  const input =
    coerceRawInput(update.rawInput, toolKind) ??
    coerceRawInput(update.input, toolKind) ??
    coerceRawInput(update.arguments, toolKind) ??
    coerceRawInput(update.args, toolKind);

  if (input) {
    const query = stringField(
      input,
      "pattern",
      "query",
      "search",
      "searchTerm",
      "regex",
      "glob_pattern",
      "globPattern",
      "glob",
    );
    const filePath = stringField(
      input,
      "file_path",
      "filePath",
      "target_file",
      "targetFile",
      "relativePath",
      "filename",
      "file",
      "path",
      "target_directory",
      "targetDirectory",
      "directory",
      "dir",
    );
    const command =
      stringField(input, "command", "cmd") ??
      (() => {
        const executable = stringField(input, "executable");
        if (!executable) return null;
        const args = input.args;
        if (Array.isArray(args)) {
          const parts = args
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(Boolean);
          return parts.length > 0
            ? `${executable} ${parts.join(" ")}`
            : executable;
        }
        if (typeof args === "string" && args.trim()) {
          return `${executable} ${args.trim()}`;
        }
        return executable;
      })();

    if (prefersSearch) {
      if (query) {
        const quoted = quoteSearchQuery(query);
        if (filePath) {
          return truncateDetail(
            `${quoted} in ${formatPathForDetail(filePath)}`,
          );
        }
        return quoted;
      }
      if (filePath) return formatPathForDetail(filePath);
    } else {
      if (filePath) return formatPathForDetail(filePath);
      if (command) return truncateDetail(command);
      if (query) return truncateDetail(query);
    }
  }

  const nestedPaths = /** @type {string[]} */ ([]);
  collectPathsFromValue(update, nestedPaths, new Set(), 0);
  if (nestedPaths[0]) return formatPathForDetail(nestedPaths[0]);

  const contentText = extractToolContentText(update.content);
  if (contentText) return contentText;

  return undefined;
}

/**
 * Present one ACP tool_call / tool_call_update as a timeline activity.
 * T3-style: short kind verb in the heading; path/query in detail.
 * Exported for unit tests (matches desktop agent-acp-activity semantics).
 * @param {Record<string, unknown>} update
 * @param {Activity | undefined} existing
 * @returns {Activity}
 */
export function presentAcpToolActivity(update, existing) {
  const toolCallId =
    typeof update.toolCallId === "string" && update.toolCallId.trim()
      ? update.toolCallId.trim()
      : existing?.id || `tool-${Date.now().toString(36)}`;
  const hasKind = typeof update.kind === "string" && Boolean(update.kind.trim());
  const toolKind = hasKind
    ? String(update.kind).trim()
    : existing?.toolKind;
  const hasTitle =
    typeof update.title === "string" && Boolean(update.title.trim());
  const titleFromAgent = hasTitle
    ? String(update.title).trim()
    : existing && !isGenericToolTitle(existing.title)
      ? existing.title
      : "";
  const peeled = peelToolTitle(titleFromAgent);
  const detail =
    toolDetailFromUpdate(update, toolKind) ??
    peeled.detailHint ??
    existing?.detail;
  // T3 summary style: kind verb when known so the path sits in detail.
  const kindLabel = toolKindVerb(toolKind);
  const title = kindLabel
    ? kindLabel
    : peeled.detailHint
      ? presentToolTitle(peeled.title, toolKind)
      : presentToolTitle(titleFromAgent, toolKind);
  const status = parseStatus(update.status) ?? existing?.status ?? "in_progress";
  return {
    id: toolCallId,
    kind: "tool",
    title,
    detail,
    status,
    toolKind,
    diff: toolDiffFromUpdate(update) ?? existing?.diff,
  };
}

/**
 * T3 shouldEmitToolCallUpdate: hold in-progress rows until detail exists.
 * @param {Activity} activity
 * @param {boolean} alreadyVisible
 */
function shouldEmitToolActivity(activity, alreadyVisible) {
  if (alreadyVisible) return true;
  if (activity.status === "completed" || activity.status === "failed") {
    return true;
  }
  return Boolean(activity.detail && String(activity.detail).trim());
}

/**
 * @param {string} taskId
 * @param {string | null | undefined} chatId
 * @param {unknown} update
 */
export function projectAcpSessionUpdate(taskId, chatId, update) {
  const id = taskId.trim();
  const cid =
    (typeof chatId === "string" && chatId.trim().toLowerCase()) ||
    liveByTaskId.get(id)?.chatId ||
    "";
  if (!id || !cid) return null;

  let turn = liveByTaskId.get(id);
  if (!turn || turn.chatId !== cid) {
    turn = emptyTurn(id, cid);
    liveByTaskId.set(id, turn);
  }

  if (!update || typeof update !== "object") return turn;
  const u = /** @type {Record<string, unknown>} */ (update);
  const sessionUpdate =
    typeof u.sessionUpdate === "string" ? u.sessionUpdate : "";

  switch (sessionUpdate) {
    case "agent_message_chunk": {
      const chunk = messageChunkText(u);
      if (!chunk) break;
      turn.segments = appendAssistantTextChunk(turn.segments, chunk);
      turn.assistantDraft = assistantDraftFromSegments(turn.segments);
      turn.activities = activitiesFromSegments(turn.segments);
      turn.dirty = true;
      break;
    }
    case "tool_call":
    case "tool_call_update": {
      const toolCallId =
        typeof u.toolCallId === "string" ? u.toolCallId.trim() : "";
      const existingVisible = turn.activities.find((a) => a.id === toolCallId);
      const existingPending = toolCallId
        ? turn.pendingTools[toolCallId]
        : undefined;
      const existing = existingVisible ?? existingPending;
      // T3 mergeToolCallState: accumulate rawInput/locations across patches.
      const mergedUpdate = mergeToolCallPayload(
        toolCallId ? turn.toolCallPayloads[toolCallId] : undefined,
        u,
      );
      if (toolCallId) {
        turn.toolCallPayloads = {
          ...turn.toolCallPayloads,
          [toolCallId]: mergedUpdate,
        };
      }
      const activity = presentAcpToolActivity(mergedUpdate, existing);
      // T3 shouldEmitToolCallUpdate: hold until path/query detail arrives.
      if (!shouldEmitToolActivity(activity, Boolean(existingVisible))) {
        turn.pendingTools = {
          ...turn.pendingTools,
          [activity.id]: activity,
        };
        turn.dirty = true;
        break;
      }
      if (activity.id in turn.pendingTools) {
        const { [activity.id]: _removed, ...rest } = turn.pendingTools;
        turn.pendingTools = rest;
      }
      turn.segments = upsertActivityInSegments(turn.segments, activity);
      turn.activities = activitiesFromSegments(turn.segments);
      turn.dirty = true;
      break;
    }
    case "agent_thought_chunk": {
      const chunk = thoughtText(u);
      if (!chunk) break;
      const previous = turn.activities.find((a) => a.id === THOUGHT_ID);
      const combined = previous?.detail ? `${previous.detail}${chunk}` : chunk;
      const trimmed =
        combined.length > 4000 ? `…${combined.slice(-3997)}` : combined;
      turn.segments = upsertActivityInSegments(turn.segments, {
        id: THOUGHT_ID,
        kind: "thought",
        title: "Thinking",
        detail: trimmed,
        status: "in_progress",
      });
      turn.activities = activitiesFromSegments(turn.segments);
      turn.dirty = true;
      break;
    }
    case "plan": {
      const entries = Array.isArray(u.entries) ? u.entries : [];
      const detail = entries
        .map((entry) => {
          if (!entry || typeof entry !== "object") return "";
          const e = /** @type {Record<string, unknown>} */ (entry);
          return typeof e.content === "string" ? e.content.trim() : "";
        })
        .filter(Boolean)
        .join("\n");
      turn.segments = upsertActivityInSegments(turn.segments, {
        id: PLAN_ID,
        kind: "plan",
        title: "Plan",
        detail: detail || undefined,
        status: "in_progress",
      });
      turn.activities = activitiesFromSegments(turn.segments);
      turn.dirty = true;
      break;
    }
    default:
      break;
  }

  if (turn.dirty) schedulePersist(id);
  return turn;
}

/**
 * @param {LiveTurn["planSteps"]} previous
 * @param {LiveTurn["planSteps"]} next
 * @param {boolean} merge
 * @returns {LiveTurn["planSteps"]}
 */
function mergePlanSteps(previous, next, merge) {
  if (!merge || previous.length === 0) return [...next];
  /** @type {Map<string, LiveTurn["planSteps"][number]>} */
  const byStep = new Map();
  for (const step of previous) {
    byStep.set(step.step, step);
  }
  for (const step of next) {
    byStep.set(step.step, step);
  }
  return [...byStep.values()];
}

/**
 * @param {string} taskId
 * @param {string | null | undefined} chatId
 * @param {unknown} params
 */
export function projectCursorUpdateTodos(taskId, chatId, params) {
  const id = taskId.trim();
  const turn = liveByTaskId.get(id);
  if (!turn) return null;
  if (!params || typeof params !== "object") return turn;
  const raw = /** @type {Record<string, unknown>} */ (params);
  const todos = Array.isArray(raw.todos) ? raw.todos : [];
  /** @type {LiveTurn["planSteps"]} */
  const plan = [];
  for (const todo of todos) {
    if (!todo || typeof todo !== "object") continue;
    const t = /** @type {Record<string, unknown>} */ (todo);
    const step =
      (typeof t.content === "string" && t.content.trim()) ||
      (typeof t.title === "string" && t.title.trim()) ||
      "";
    if (!step) continue;
    const status =
      t.status === "completed"
        ? "completed"
        : t.status === "in_progress" || t.status === "inProgress"
          ? "inProgress"
          : "pending";
    plan.push({ step, status });
  }
  if (raw.merge === true && plan.length === 0) return turn;
  turn.planSteps = mergePlanSteps(turn.planSteps, plan, raw.merge === true);
  turn.dirty = true;
  schedulePersist(id);
  return turn;
}

/**
 * Project a pending Cursor ask_question / permission into the live turn
 * (T3 user-input.requested visibility).
 * @param {string} taskId
 * @param {string | null | undefined} chatId
 * @param {{
 *   requestId: string,
 *   kind: "permission" | "ask_question",
 *   title?: string | null,
 *   detail?: string | null,
 * }} request
 */
export function projectAcpUiRequest(taskId, chatId, request) {
  const id = taskId.trim();
  const requestId = request.requestId?.trim();
  if (!id || !requestId) return null;
  let turn = liveByTaskId.get(id);
  const cid =
    (typeof chatId === "string" && chatId.trim().toLowerCase()) ||
    turn?.chatId ||
    "";
  if (!cid) return null;
  if (!turn || turn.chatId !== cid) {
    turn = emptyTurn(id, cid);
    liveByTaskId.set(id, turn);
  }
  const title =
    (typeof request.title === "string" && request.title.trim()) ||
    (request.kind === "ask_question" ? "Agent question" : "Permission required");
  const detail =
    typeof request.detail === "string" && request.detail.trim()
      ? request.detail.trim()
      : undefined;
  turn.segments = upsertActivityInSegments(turn.segments, {
    id: `acp-ui-${requestId}`,
    kind: "info",
    title,
    detail,
    status: "in_progress",
  });
  turn.activities = activitiesFromSegments(turn.segments);
  turn.dirty = true;
  schedulePersist(id);
  return turn;
}

/**
 * Mark a projected ask/permission activity complete when answered or timed out.
 * @param {string} taskId
 * @param {string | null | undefined} chatId
 * @param {string} requestId
 */
export function completeAcpProjectedUiRequest(taskId, chatId, requestId) {
  const id = taskId.trim();
  const rid = requestId.trim();
  if (!id || !rid) return null;
  const turn = liveByTaskId.get(id);
  if (!turn) return null;
  const activityId = `acp-ui-${rid}`;
  const existing = turn.activities.find((a) => a.id === activityId);
  if (!existing) return turn;
  turn.segments = upsertActivityInSegments(turn.segments, {
    ...existing,
    status: "completed",
  });
  turn.activities = activitiesFromSegments(turn.segments);
  turn.dirty = true;
  schedulePersist(id);
  return turn;
}

/**
 * @param {string} taskId
 * @param {string | null | undefined} chatId
 * @param {unknown} params
 */
export function projectCursorCreatePlan(taskId, chatId, params) {
  const id = taskId.trim();
  let turn = liveByTaskId.get(id);
  const cid =
    (typeof chatId === "string" && chatId.trim().toLowerCase()) ||
    turn?.chatId ||
    "";
  if (!id || !cid) return null;
  if (!turn) {
    turn = emptyTurn(id, cid);
    liveByTaskId.set(id, turn);
  }
  if (!params || typeof params !== "object") return turn;
  const raw = /** @type {Record<string, unknown>} */ (params);
  if (typeof raw.plan === "string" && raw.plan.trim()) {
    turn.proposedPlanMarkdown = raw.plan;
    turn.dirty = true;
    schedulePersist(id);
  }
  return turn;
}

/**
 * @param {string} taskId
 * @param {string | null | undefined} chatId
 * @param {string | null | undefined} finalText
 */
export function sealAcpProjectedTurn(taskId, chatId, finalText) {
  const id = taskId.trim();
  const turn = liveByTaskId.get(id);
  const cid =
    (typeof chatId === "string" && chatId.trim().toLowerCase()) ||
    turn?.chatId ||
    "";
  if (!id || !cid) return null;

  if (turn) {
    // Flush held tool calls (waiting for detail) before sealing — T3 end-of-turn.
    for (const pending of Object.values(turn.pendingTools)) {
      turn.segments = upsertActivityInSegments(turn.segments, {
        ...pending,
        status: pending.status === "failed" ? "failed" : "completed",
      });
    }
    turn.pendingTools = {};
    turn.activities = activitiesFromSegments(turn.segments);

    const text = stripTransientAgentStreamError(
      (typeof finalText === "string" && finalText.trim()) || turn.assistantDraft,
    ).trim();
    if (text && text !== turn.assistantDraft) {
      // Prefer provider final text when present.
      const last = turn.segments[turn.segments.length - 1];
      if (last?.kind === "text") {
        last.text = text;
      } else if (text) {
        turn.segments.push({ id: newId("text"), kind: "text", text });
      }
      turn.assistantDraft = text;
      turn.activities = activitiesFromSegments(turn.segments).map((a) =>
        a.status === "in_progress" || a.status === "pending"
          ? { ...a, status: "completed" }
          : a,
      );
      turn.segments = turn.segments.map((segment) =>
        segment.kind === "work"
          ? {
              ...segment,
              activities: segment.activities.map((a) =>
                a.status === "in_progress" || a.status === "pending"
                  ? { ...a, status: /** @type {const} */ ("completed") }
                  : a,
              ),
            }
          : segment,
      );
    } else {
      turn.activities = turn.activities.map((a) =>
        a.status === "in_progress" || a.status === "pending"
          ? { ...a, status: "completed" }
          : a,
      );
      turn.segments = turn.segments.map((segment) =>
        segment.kind === "work"
          ? {
              ...segment,
              activities: segment.activities.map((a) =>
                a.status === "in_progress" || a.status === "pending"
                  ? { ...a, status: /** @type {const} */ ("completed") }
                  : a,
              ),
            }
          : segment,
      );
    }
    turn.dirty = true;
    const timer = flushTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      flushTimers.delete(id);
    }
    persistTurn(turn);
    liveByTaskId.delete(id);
    return turn;
  }

  if (typeof finalText === "string" && finalText.trim()) {
    upsertAssistantTurnTimeline(cid, {
      text: stripTransientAgentStreamError(finalText).trim(),
    });
  }
  return null;
}

/**
 * @param {string} taskId
 */
export function clearAcpProjectedTurn(taskId) {
  const id = taskId.trim();
  const timer = flushTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(id);
  }
  liveByTaskId.delete(id);
}

export function listProjectedTurns() {
  return [...liveByTaskId.values()].map((t) => ({
    taskId: t.taskId,
    chatId: t.chatId,
    messageId: t.messageId,
    workedStartedAt: t.workedStartedAt,
  }));
}
