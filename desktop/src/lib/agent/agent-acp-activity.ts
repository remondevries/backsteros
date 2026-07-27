import {
  extractPlanMarkdown,
  extractTodosAsPlan,
  mergePlanSteps,
  type AgentChatPlanStep,
  type CursorCreatePlanParams,
  type CursorUpdateTodosParams,
} from "./t3-port/cursor-todos";
import {
  isGenericToolTitle,
  normalizeCompactToolLabel,
  toolKindVerb,
} from "./t3-port/work-entry-labels";

export type { AgentChatPlanStep } from "./t3-port/cursor-todos";

/** Ephemeral in-turn activity derived from Cursor ACP `session/update` frames. */
export type AgentChatActivityStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type AgentChatActivityDiffLine = {
  type: "add" | "del" | "ctx";
  text: string;
};

/** Compact edit preview from ACP `content` diff blocks. */
export type AgentChatActivityDiff = {
  path?: string;
  additions: number;
  deletions: number;
  lines: AgentChatActivityDiffLine[];
};

export type AgentChatActivityItem = {
  id: string;
  kind: "tool" | "thought" | "plan" | "info";
  title: string;
  detail?: string;
  status?: AgentChatActivityStatus;
  /** ACP tool kind when known (read / edit / execute / search / …). */
  toolKind?: string;
  /** File edit preview when the tool emitted a diff. */
  diff?: AgentChatActivityDiff;
};

export type AgentChatTurnPhase =
  | "idle"
  | "starting"
  | "thinking"
  | "tooling"
  | "responding";

/**
 * Chronological turn body: tool/thought groups alternate with assistant text.
 * tools → text → tools → text (T3-style interleaved timeline).
 */
export type AgentChatTurnSegment =
  | {
      id: string;
      kind: "work";
      activities: AgentChatActivityItem[];
    }
  | {
      id: string;
      kind: "text";
      text: string;
    };

export type AgentChatTurnUiState = {
  activities: AgentChatActivityItem[];
  /** Ordered work/text blocks for live + settled rendering. */
  segments: AgentChatTurnSegment[];
  assistantDraft: string;
  phase: AgentChatTurnPhase;
  /** Live checklist from `cursor/update_todos` (t3 ActivePlanState.steps). */
  planSteps: AgentChatPlanStep[];
  /** Markdown from `cursor/create_plan` (t3 proposed plan). */
  proposedPlanMarkdown: string | null;
};

const PENDING_TURN_ID = "acp-turn-pending";
const THOUGHT_ACTIVITY_ID = "acp-thought-stream";
const PLAN_ACTIVITY_ID = "acp-plan";
/** Keep enough lines for the turn Diff panel; compact tool rows truncate in UI. */
const MAX_DIFF_PREVIEW_LINES = 800;

function newSegmentId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 8)}`;
}

export function activitiesFromSegments(
  segments: readonly AgentChatTurnSegment[],
): AgentChatActivityItem[] {
  const out: AgentChatActivityItem[] = [];
  for (const segment of segments) {
    if (segment.kind === "work") out.push(...segment.activities);
  }
  return out;
}

export function assistantDraftFromSegments(
  segments: readonly AgentChatTurnSegment[],
): string {
  return segments
    .filter(
      (segment): segment is Extract<AgentChatTurnSegment, { kind: "text" }> =>
        segment.kind === "text",
    )
    .map((segment) => segment.text)
    .join("\n\n");
}

/** Legacy / settle fallback: one work block then one text block. */
export function segmentsFromActivitiesAndText(
  activities: readonly AgentChatActivityItem[] | undefined,
  text: string | null | undefined,
): AgentChatTurnSegment[] {
  const segments: AgentChatTurnSegment[] = [];
  if (activities && activities.length > 0) {
    segments.push({
      id: newSegmentId("work"),
      kind: "work",
      activities: activities.map((item) => ({ ...item })),
    });
  }
  const trimmed = text?.trim() ?? "";
  if (trimmed) {
    segments.push({
      id: newSegmentId("text"),
      kind: "text",
      text: trimmed,
    });
  }
  return segments;
}

function mergeActivityItem(
  previous: AgentChatActivityItem,
  next: AgentChatActivityItem,
): AgentChatActivityItem {
  return {
    ...previous,
    ...next,
    detail: next.detail ?? previous.detail,
    status: next.status ?? previous.status,
    toolKind: next.toolKind ?? previous.toolKind,
    diff: next.diff ?? previous.diff,
  };
}

function upsertActivityInSegments(
  segments: readonly AgentChatTurnSegment[],
  next: AgentChatActivityItem,
): AgentChatTurnSegment[] {
  const cleaned =
    next.id === PENDING_TURN_ID
      ? [...segments]
      : segments
          .map((segment) => {
            if (segment.kind !== "work") return segment;
            const activities = segment.activities.filter(
              (item) => item.id !== PENDING_TURN_ID,
            );
            return activities.length === segment.activities.length
              ? segment
              : { ...segment, activities };
          })
          .filter(
            (segment) =>
              segment.kind === "text" || segment.activities.length > 0,
          );

  for (let i = 0; i < cleaned.length; i += 1) {
    const segment = cleaned[i]!;
    if (segment.kind !== "work") continue;
    const index = segment.activities.findIndex((item) => item.id === next.id);
    if (index < 0) continue;
    const activities = [...segment.activities];
    activities[index] = mergeActivityItem(activities[index]!, next);
    const copy = [...cleaned];
    copy[i] = { ...segment, activities };
    return copy;
  }

  const last = cleaned[cleaned.length - 1];
  if (last?.kind === "work") {
    return [
      ...cleaned.slice(0, -1),
      { ...last, activities: [...last.activities, next] },
    ];
  }
  return [
    ...cleaned,
    { id: newSegmentId("work"), kind: "work", activities: [next] },
  ];
}

function mapActivitiesInSegments(
  segments: readonly AgentChatTurnSegment[],
  mapFn: (item: AgentChatActivityItem) => AgentChatActivityItem,
): AgentChatTurnSegment[] {
  return segments.map((segment) => {
    if (segment.kind !== "work") return segment;
    return {
      ...segment,
      activities: segment.activities.map(mapFn),
    };
  });
}

function appendAssistantTextChunk(
  segments: readonly AgentChatTurnSegment[],
  chunk: string,
): AgentChatTurnSegment[] {
  if (!chunk) return [...segments];
  const last = segments[segments.length - 1];
  if (last?.kind === "text") {
    return [
      ...segments.slice(0, -1),
      { ...last, text: `${last.text}${chunk}` },
    ];
  }
  return [
    ...segments,
    { id: newSegmentId("text"), kind: "text", text: chunk },
  ];
}

/**
 * Apply authoritative assistant text (afterAgentResponse / prompt-complete)
 * without collapsing earlier interleaved work/text blocks.
 */
export function applyAssistantTextToTurn(
  state: AgentChatTurnUiState,
  text: string,
): AgentChatTurnUiState {
  const trimmed = text.trim();
  if (!trimmed) return state;

  const currentDraft = assistantDraftFromSegments(state.segments).trim();
  if (currentDraft === trimmed) {
    return {
      ...state,
      assistantDraft: trimmed,
      phase: "responding",
    };
  }

  // Streaming draft is a prefix of the final — append the remainder to the
  // last text segment (keeps prior work↔text interleaving intact).
  if (currentDraft && trimmed.startsWith(currentDraft)) {
    const remainder = trimmed.slice(currentDraft.length);
    const segments = remainder
      ? appendAssistantTextChunk(state.segments, remainder)
      : state.segments;
    return {
      ...state,
      segments: [...segments],
      activities: activitiesFromSegments(segments),
      assistantDraft: trimmed,
      phase: "responding",
    };
  }

  // No text yet (Herdr tools-only so far) — open a text segment after work.
  if (!currentDraft) {
    const segments = appendAssistantTextChunk(state.segments, trimmed);
    return {
      ...state,
      segments,
      activities: activitiesFromSegments(segments),
      assistantDraft: trimmed,
      phase: "responding",
    };
  }

  // Divergent final text — replace the trailing text segment only.
  const segments = [...state.segments];
  const last = segments[segments.length - 1];
  if (last?.kind === "text") {
    segments[segments.length - 1] = { ...last, text: trimmed };
  } else {
    segments.push({
      id: newSegmentId("text"),
      kind: "text",
      text: trimmed,
    });
  }
  return {
    ...state,
    segments,
    activities: activitiesFromSegments(segments),
    assistantDraft: trimmed,
    phase: "responding",
  };
}

export function emptyAgentChatTurnUiState(): AgentChatTurnUiState {
  return {
    activities: [],
    segments: [],
    assistantDraft: "",
    phase: "idle",
    planSteps: [],
    proposedPlanMarkdown: null,
  };
}

/** Instant feedback the moment the user sends — before the first ACP frame. */
export function createOptimisticTurnUiState(): AgentChatTurnUiState {
  const pending: AgentChatActivityItem = {
    id: PENDING_TURN_ID,
    kind: "info",
    title: "Thinking",
    status: "in_progress",
  };
  return {
    activities: [pending],
    segments: [
      {
        id: newSegmentId("work"),
        kind: "work",
        activities: [pending],
      },
    ],
    assistantDraft: "",
    phase: "starting",
    planSteps: [],
    proposedPlanMarkdown: null,
  };
}

export function turnPhaseLabel(phase: AgentChatTurnPhase): string {
  switch (phase) {
    case "starting":
      return "Starting…";
    case "thinking":
      return "Thinking…";
    case "tooling":
      return "Working…";
    case "responding":
      return "Writing…";
    default:
      return "";
  }
}

function parseActivityStatus(value: unknown): AgentChatActivityStatus | undefined {
  if (value === "pending") return "pending";
  if (value === "in_progress" || value === "inProgress") return "in_progress";
  if (value === "completed") return "completed";
  if (value === "failed") return "failed";
  return undefined;
}

/** Short path for activity rows — keep enough parent folders to disambiguate. */
function formatPathForDetail(path: string, max = 64): string {
  const normalized = path.replace(/\\/g, "/").trim();
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return truncateDetail(normalized, max);
  if (parts.length <= 3) return truncateDetail(parts.join("/"), max);
  return truncateDetail(parts.slice(-3).join("/"), max);
}

function maybePathLike(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Walk nested ACP payloads for file paths (rawInput / locations / content). */
function collectPathsFromValue(
  value: unknown,
  paths: string[],
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 5 || paths.length >= 8) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromValue(entry, paths, seen, depth + 1);
      if (paths.length >= 8) return;
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;

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
  /^(reading|read(?:\s+file)?|grepping|grep(?:ping)?|searching|search|glob(?:bing)?|editing|edit(?:ing)?|writing|write|deleting|delete|moving|move|fetching|fetch|running|ran|terminal|bash|shell)\b(?:\s+|$)(.*)$/i;

/**
 * Split Cursor titles like "Reading src/app.ts" into a short verb + detail.
 * When ACP omits rawInput, the path often only lives in the title.
 */
function peelToolTitle(titleFromAgent: string): {
  title: string;
  detailHint?: string;
} {
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

/** Prefer T3-style action labels over raw Cursor tool titles when possible. */
function presentToolTitle(
  titleFromAgent: string,
  toolKind: string | undefined,
): string {
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

function truncateDetail(value: string, max = 72): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length > max ? `${oneLine.slice(0, max - 3)}…` : oneLine;
}

function stringField(
  input: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function quoteSearchQuery(query: string): string {
  const truncated = truncateDetail(query);
  if (!truncated) return "";
  return truncated.includes(" ") || truncated.includes('"')
    ? truncated
    : `"${truncated}"`;
}

function coerceRawInput(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Cursor sometimes sends a bare path / glob as the rawInput string.
      if (maybePathLike(trimmed) || trimmed.includes("*")) {
        return { path: trimmed };
      }
      return null;
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * Lightweight line diff for activity previews (not a full Myers diff).
 * Prefers contiguous prefixes/suffixes, then marks the middle as replaced.
 */
export function buildActivityDiffPreview(
  oldText: string | null | undefined,
  newText: string | null | undefined,
  path?: string | null,
): AgentChatActivityDiff | undefined {
  const before = typeof oldText === "string" ? oldText : "";
  const after = typeof newText === "string" ? newText : "";
  if (!before && !after) return undefined;

  const oldLines = splitLines(before);
  const newLines = splitLines(after);

  // Drop trailing empty line from split on final newline.
  if (oldLines.length > 0 && oldLines[oldLines.length - 1] === "") oldLines.pop();
  if (newLines.length > 0 && newLines[newLines.length - 1] === "") newLines.pop();

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

  const lines: AgentChatActivityDiffLine[] = [];
  const pushCtx = (from: number, to: number, source: string[]) => {
    for (let i = from; i < to; i += 1) {
      lines.push({ type: "ctx", text: source[i] ?? "" });
    }
  };

  const ctxBefore = Math.min(2, start);
  pushCtx(start - ctxBefore, start, oldLines);

  for (let i = start; i < oldEnd; i += 1) {
    lines.push({ type: "del", text: oldLines[i] ?? "" });
  }
  for (let i = start; i < newEnd; i += 1) {
    lines.push({ type: "add", text: newLines[i] ?? "" });
  }

  const ctxAfter = Math.min(2, oldLines.length - oldEnd);
  pushCtx(oldEnd, oldEnd + ctxAfter, oldLines);

  const additions = lines.filter((line) => line.type === "add").length;
  const deletions = lines.filter((line) => line.type === "del").length;
  if (additions === 0 && deletions === 0) return undefined;

  let preview = lines;
  if (preview.length > MAX_DIFF_PREVIEW_LINES) {
    const head = preview.slice(0, MAX_DIFF_PREVIEW_LINES - 1);
    preview = [
      ...head,
      { type: "ctx", text: `… ${preview.length - head.length} more lines` },
    ];
  }

  return {
    path: path?.trim() ? path.trim() : undefined,
    additions,
    deletions,
    lines: preview,
  };
}

function toolDiffFromUpdate(
  update: Record<string, unknown>,
): AgentChatActivityDiff | undefined {
  const content = update.content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = typeof b.type === "string" ? b.type : "";
    if (type !== "diff") continue;
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
    const preview = buildActivityDiffPreview(oldText, newText, path);
    if (preview) return preview;
  }
  return undefined;
}

function toolDetailFromUpdate(
  update: Record<string, unknown>,
  toolKind?: string,
): string | undefined {
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

  const nestedPaths: string[] = [];
  collectPathsFromValue(update, nestedPaths, new Set(), 0);
  if (nestedPaths[0]) return formatPathForDetail(nestedPaths[0]);

  return undefined;
}

function thoughtTextFromChunk(update: Record<string, unknown>): string {
  const content = update.content;
  if (content && typeof content === "object") {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  if (typeof update.text === "string") return update.text;
  return "";
}

function messageChunkText(update: Record<string, unknown>): string {
  return thoughtTextFromChunk(update);
}

function planSummary(update: Record<string, unknown>): string | undefined {
  const entries = update.entries ?? update.plan;
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  const first = entries[0];
  if (first && typeof first === "object") {
    const title =
      typeof (first as { title?: unknown }).title === "string"
        ? (first as { title: string }).title.trim()
        : "";
    if (title) {
      return entries.length > 1
        ? `${title} (+${entries.length - 1} more)`
        : title;
    }
  }
  return `${entries.length} step${entries.length === 1 ? "" : "s"}`;
}

function upsertItem(
  items: readonly AgentChatActivityItem[],
  next: AgentChatActivityItem,
): AgentChatActivityItem[] {
  const withoutPending =
    next.id === PENDING_TURN_ID
      ? items
      : items.filter((item) => item.id !== PENDING_TURN_ID);
  const index = withoutPending.findIndex((item) => item.id === next.id);
  if (index < 0) return [...withoutPending, next];
  const copy = [...withoutPending];
  const previous = copy[index];
  copy[index] = {
    ...previous,
    ...next,
    detail: next.detail ?? previous.detail,
    status: next.status ?? previous.status,
    toolKind: next.toolKind ?? previous.toolKind,
    diff: next.diff ?? previous.diff,
  };
  return copy;
}

/** Mark open rows complete so the timeline freezes with the answer. */
export function finalizeTurnActivities(
  items: readonly AgentChatActivityItem[],
): AgentChatActivityItem[] {
  return items
    .filter((item) => item.id !== PENDING_TURN_ID)
    .map((item) => {
      if (item.status === "completed" || item.status === "failed") return item;
      return { ...item, status: "completed" as const };
    });
}

export function finalizeTurnSegments(
  segments: readonly AgentChatTurnSegment[],
): AgentChatTurnSegment[] {
  return segments
    .map((segment) => {
      if (segment.kind === "text") {
        const text = segment.text.trimEnd();
        return text ? { ...segment, text } : null;
      }
      const activities = finalizeTurnActivities(segment.activities);
      if (activities.length === 0) return null;
      return { ...segment, activities };
    })
    .filter((segment): segment is AgentChatTurnSegment => segment != null);
}

/** Whether an activity row should start expanded in the transcript. */
export function defaultActivityExpanded(
  item: AgentChatActivityItem,
  live: boolean,
): boolean {
  if (item.kind === "thought" || item.kind === "info") {
    return live && (item.status === "in_progress" || item.status === "pending");
  }
  if (item.diff) {
    // Show live edits; keep completed diffs collapsed until clicked.
    return live && (item.status === "in_progress" || item.status === "pending");
  }
  return false;
}

export function activityIsCollapsible(item: AgentChatActivityItem): boolean {
  if (item.kind === "thought" || item.kind === "info") {
    return Boolean(item.detail?.trim());
  }
  if (item.kind === "plan") return Boolean(item.detail?.trim());
  return Boolean(item.diff);
}

/**
 * Apply one ACP `session/update` payload to the in-turn UI state.
 */
export function applyAcpSessionUpdateToTurn(
  state: AgentChatTurnUiState,
  update: unknown,
): AgentChatTurnUiState {
  if (!update || typeof update !== "object") return state;
  const u = update as Record<string, unknown>;
  const sessionUpdate =
    typeof u.sessionUpdate === "string" ? u.sessionUpdate : "";

  switch (sessionUpdate) {
    case "agent_message_chunk": {
      const chunk = messageChunkText(u);
      if (!chunk) return state;
      // Complete non-tool in-progress rows, then open/continue a text segment
      // after the current work block (interleaved timeline).
      const sealed = mapActivitiesInSegments(
        state.segments.filter((segment) => {
          if (segment.kind !== "work") return true;
          return segment.activities.some((item) => item.id !== PENDING_TURN_ID);
        }),
        (item) =>
          item.kind !== "tool" &&
          (item.status === "in_progress" || item.status === "pending")
            ? { ...item, status: "completed" as const }
            : item,
      ).filter(
        (segment) =>
          segment.kind === "text" ||
          segment.activities.some((item) => item.id !== PENDING_TURN_ID),
      );
      const segments = appendAssistantTextChunk(sealed, chunk);
      return {
        ...state,
        segments,
        activities: activitiesFromSegments(segments),
        assistantDraft: assistantDraftFromSegments(segments),
        phase: "responding",
      };
    }
    case "tool_call":
    case "tool_call_update": {
      const toolCallId =
        typeof u.toolCallId === "string" && u.toolCallId.trim()
          ? u.toolCallId.trim()
          : `tool-${state.activities.length}`;
      const existing = state.activities.find((item) => item.id === toolCallId);
      const hasKind = typeof u.kind === "string" && Boolean(u.kind.trim());
      const toolKind = hasKind
        ? (u.kind as string).trim()
        : existing?.toolKind;
      const hasTitle = typeof u.title === "string" && Boolean(u.title.trim());
      // ACP patch semantics: omitted title/kind leave prior values. Avoid
      // inventing a generic "Tool" title on status-only updates.
      const titleFromAgent = hasTitle
        ? (u.title as string).trim()
        : existing && !isGenericToolTitle(existing.title)
          ? existing.title
          : "";
      const peeled = peelToolTitle(titleFromAgent);
      const title = presentToolTitle(peeled.title || titleFromAgent, toolKind);
      const diff = toolDiffFromUpdate(u);
      const detail =
        toolDetailFromUpdate(u, toolKind) ??
        peeled.detailHint ??
        (diff?.path ? formatPathForDetail(diff.path) : undefined);
      const status =
        parseActivityStatus(u.status) ??
        existing?.status ??
        "in_progress";
      const segments = upsertActivityInSegments(state.segments, {
        id: toolCallId,
        kind: "tool",
        title,
        detail,
        status,
        toolKind,
        diff,
      });
      return {
        ...state,
        segments,
        activities: activitiesFromSegments(segments),
        // Keep responding if we already streamed text — next tools open a new
        // work segment below that text.
        phase: state.phase === "responding" ? "responding" : "tooling",
      };
    }
    case "agent_thought_chunk": {
      const chunk = thoughtTextFromChunk(u);
      if (!chunk) return state;
      const previous = state.activities.find(
        (item) => item.id === THOUGHT_ACTIVITY_ID,
      );
      const combined = previous?.detail
        ? `${previous.detail}${chunk}`
        : chunk;
      // Keep a generous window for the live thinking log (scroll in UI).
      const trimmed =
        combined.length > 4000 ? `…${combined.slice(-3997)}` : combined;
      const segments = upsertActivityInSegments(state.segments, {
        id: THOUGHT_ACTIVITY_ID,
        kind: "thought",
        title: "Thinking",
        detail: trimmed,
        status: "in_progress",
      });
      return {
        ...state,
        segments,
        activities: activitiesFromSegments(segments),
        phase:
          state.phase === "responding" || state.phase === "tooling"
            ? state.phase
            : "thinking",
      };
    }
    case "plan": {
      const summary = planSummary(u);
      const segments = upsertActivityInSegments(state.segments, {
        id: PLAN_ACTIVITY_ID,
        kind: "plan",
        title: "Plan",
        detail: summary,
        status: "in_progress",
      });
      return {
        ...state,
        segments,
        activities: activitiesFromSegments(segments),
        phase:
          state.phase === "responding" || state.phase === "tooling"
            ? state.phase
            : "thinking",
      };
    }
  }

  return state;
}

/** Apply `cursor/update_todos` (t3 emitPlanUpdate / extractTodosAsPlan). */
export function applyCursorUpdateTodosToTurn(
  state: AgentChatTurnUiState,
  params: unknown,
): AgentChatTurnUiState {
  if (!params || typeof params !== "object") return state;
  const raw = params as CursorUpdateTodosParams;
  const { plan } = extractTodosAsPlan(raw);
  if (plan.length === 0 && raw.merge !== true) {
    return { ...state, planSteps: [] };
  }
  const planSteps = mergePlanSteps(
    state.planSteps,
    plan,
    raw.merge === true,
  );
  const inProgress = planSteps.some((step) => step.status === "inProgress");
  return {
    ...state,
    planSteps,
    phase:
      state.phase === "responding" || state.phase === "tooling"
        ? state.phase
        : inProgress
          ? "tooling"
          : state.phase === "idle"
            ? "thinking"
            : state.phase,
  };
}

/** Apply `cursor/create_plan` (t3 turn.proposed.completed). */
export function applyCursorCreatePlanToTurn(
  state: AgentChatTurnUiState,
  params: unknown,
): AgentChatTurnUiState {
  if (!params || typeof params !== "object") return state;
  const raw = params as CursorCreatePlanParams;
  const proposedPlanMarkdown = extractPlanMarkdown(raw);
  const fromTodos = extractTodosAsPlan({ todos: raw.todos });
  return {
    ...state,
    proposedPlanMarkdown,
    planSteps:
      fromTodos.plan.length > 0
        ? mergePlanSteps(state.planSteps, fromTodos.plan, false)
        : state.planSteps,
    phase:
      state.phase === "responding" || state.phase === "tooling"
        ? state.phase
        : "thinking",
  };
}

/** @deprecated Prefer {@link applyAcpSessionUpdateToTurn}. */
export function applyAcpSessionUpdate(
  items: readonly AgentChatActivityItem[],
  update: unknown,
): AgentChatActivityItem[] {
  return applyAcpSessionUpdateToTurn(
    {
      activities: [...items],
      segments: segmentsFromActivitiesAndText(items, ""),
      assistantDraft: "",
      phase: "tooling",
      planSteps: [],
      proposedPlanMarkdown: null,
    },
    update,
  ).activities;
}

export function statusLabel(status: AgentChatActivityStatus | undefined): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "Running";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    default:
      return "";
  }
}

export function activityGlyph(item: AgentChatActivityItem): string {
  if (item.kind === "thought" || item.kind === "info") return "◆";
  if (item.kind === "plan") return "☰";
  const kind = item.toolKind?.toLowerCase();
  if (kind === "read") return "○";
  if (kind === "edit" || kind === "write") return "✎";
  if (kind === "execute" || kind === "shell") return "›";
  if (kind === "search" || kind === "grep") return "⌕";
  return "•";
}

export function formatDiffStat(diff: AgentChatActivityDiff): string {
  const parts: string[] = [];
  if (diff.additions > 0) parts.push(`+${diff.additions}`);
  if (diff.deletions > 0) parts.push(`−${diff.deletions}`);
  return parts.join(" ") || "diff";
}
