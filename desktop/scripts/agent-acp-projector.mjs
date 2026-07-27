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

function coerceRawInput(raw) {
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
 * @param {unknown} value
 * @param {string[]} paths
 * @param {Set<string>} seen
 * @param {number} depth
 */
function collectPathsFromValue(value, paths, seen, depth) {
  if (depth > 5 || paths.length >= 8) return;
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
    coerceRawInput(update.rawInput) ??
    coerceRawInput(update.input) ??
    coerceRawInput(update.arguments) ??
    coerceRawInput(update.args);

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
  const title = presentToolTitle(
    peeled.title || titleFromAgent,
    toolKind,
  );
  const detail =
    toolDetailFromUpdate(update, toolKind) ??
    peeled.detailHint ??
    existing?.detail;
  const status = parseStatus(update.status) ?? existing?.status ?? "in_progress";
  return {
    id: toolCallId,
    kind: "tool",
    title,
    detail,
    status,
    toolKind,
    diff: existing?.diff,
  };
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
      const existing = turn.activities.find(
        (a) =>
          a.id ===
          (typeof u.toolCallId === "string" ? u.toolCallId.trim() : ""),
      );
      const activity = presentAcpToolActivity(u, existing);
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
  turn.planSteps = raw.merge === true ? [...turn.planSteps, ...plan] : plan;
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
