import { stripTransientAgentStreamError } from "./agent-stream-errors";
import {
  extractPlanMarkdown,
  extractTodosAsPlan,
  mergePlanSteps,
  type AgentChatPlanStep,
  type CursorCreatePlanParams,
  type CursorUpdateTodosParams,
} from "./t3-port/cursor-todos";
import {
  deriveToolActivityPresentation,
  mergeToolCallPayload,
  shouldEmitToolActivity,
} from "./t3-port/tool-activity-presentation";
import { isGenericToolTitle } from "./t3-port/work-entry-labels";

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
  /** t3 work-log collapse key (`tool:${toolCallId}`) for lifecycle merge. */
  collapseKey?: string;
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
  /**
   * Tool calls seen but not yet shown (T3 shouldEmitToolCallUpdate).
   * Held until `detail` arrives or the tool completes/fails.
   */
  pendingTools: Record<string, AgentChatActivityItem>;
  /**
   * Accumulated ACP tool payloads by toolCallId (T3 mergeToolCallState.data).
   * Lets status-only updates keep earlier rawInput/locations for presentation.
   */
  toolCallPayloads: Record<string, Record<string, unknown>>;
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
  // Match sidecar projector (.join("")) so dual writers don't diverge on text.
  return segments
    .filter(
      (segment): segment is Extract<AgentChatTurnSegment, { kind: "text" }> =>
        segment.kind === "text",
    )
    .map((segment) => segment.text)
    .join("");
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
    const merged = stripTransientAgentStreamError(`${last.text}${chunk}`);
    if (!merged) {
      return [...segments.slice(0, -1)];
    }
    return [...segments.slice(0, -1), { ...last, text: merged }];
  }
  const text = stripTransientAgentStreamError(chunk);
  if (!text) return [...segments];
  return [
    ...segments,
    { id: newSegmentId("text"), kind: "text", text },
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
  const trimmed = stripTransientAgentStreamError(text).trim();
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

  // No text yet (tools-only so far) — open a text segment after work.
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
    pendingTools: {},
    toolCallPayloads: {},
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
    pendingTools: {},
    toolCallPayloads: {},
  };
}

function parseActivityStatus(value: unknown): AgentChatActivityStatus | undefined {
  if (value === "pending") return "pending";
  if (value === "in_progress" || value === "inProgress") return "in_progress";
  if (value === "completed") return "completed";
  if (value === "failed") return "failed";
  return undefined;
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

    // ACP v1: oldText / newText pair.
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

    // ACP v2: git_patch / unified patch text (no oldText/newText).
    const fromPatch = activityDiffFromPatchBlock(b, path);
    if (fromPatch) return fromPatch;
  }
  return undefined;
}

/** Parse ACP v2 `patch: { format, text }` or a bare unified-diff string. */
function activityDiffFromPatchBlock(
  block: Record<string, unknown>,
  path?: string,
): AgentChatActivityDiff | undefined {
  let patchText = "";
  const patch = block.patch;
  if (patch && typeof patch === "object") {
    const p = patch as Record<string, unknown>;
    if (typeof p.text === "string" && p.text.trim()) {
      patchText = p.text;
    } else if (typeof p.diff === "string" && p.diff.trim()) {
      patchText = p.diff;
    }
  }
  if (
    !patchText &&
    typeof block.text === "string" &&
    block.text.includes("@@")
  ) {
    patchText = block.text;
  }
  if (
    !patchText &&
    typeof block.unifiedDiff === "string" &&
    block.unifiedDiff.trim()
  ) {
    patchText = block.unifiedDiff;
  }
  if (!patchText.trim()) return undefined;

  const lines = linesFromUnifiedPatch(patchText);
  if (lines.length === 0) return undefined;
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

  const pathFromPatch = pathFromUnifiedPatch(patchText);
  return {
    path: path?.trim() || pathFromPatch || undefined,
    additions,
    deletions,
    lines: preview,
  };
}

function pathFromUnifiedPatch(patchText: string): string | undefined {
  for (const line of patchText.split("\n")) {
    if (line.startsWith("+++ b/")) {
      const path = line.slice("+++ b/".length).trim();
      if (path && path !== "/dev/null") return path;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim().replace(/^[ab]\//, "");
      if (path && path !== "/dev/null") return path;
    }
  }
  return undefined;
}

function linesFromUnifiedPatch(patchText: string): AgentChatActivityDiffLine[] {
  const lines: AgentChatActivityDiffLine[] = [];
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
      lines.push({ type: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : "" });
    }
  }
  return lines;
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

/**
 * Flush held tool calls into the timeline and mark open rows complete
 * (T3 end-of-turn: pending tools without detail still surface once settled).
 * Plan step statuses are left as Cursor sent them — active spinner chrome is
 * gated by live turn (`PlanTodoList active`), not by inventing completions.
 */
export function sealTurnUiState(
  state: AgentChatTurnUiState,
): AgentChatTurnUiState {
  let segments = state.segments;
  for (const pending of Object.values(state.pendingTools)) {
    segments = upsertActivityInSegments(segments, {
      ...pending,
      status: pending.status === "failed" ? "failed" : "completed",
    });
  }
  segments = finalizeTurnSegments(segments);
  return {
    ...state,
    pendingTools: {},
    segments,
    activities: activitiesFromSegments(segments),
  };
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
      const existingVisible = state.activities.find(
        (item) => item.id === toolCallId,
      );
      const existingPending = state.pendingTools[toolCallId];
      const existing = existingVisible ?? existingPending;
      // T3 mergeToolCallState: accumulate rawInput/locations across patch frames.
      const mergedUpdate = mergeToolCallPayload(
        state.toolCallPayloads[toolCallId],
        u,
      );
      const toolCallPayloads = {
        ...state.toolCallPayloads,
        [toolCallId]: mergedUpdate,
      };
      const hasKind =
        typeof mergedUpdate.kind === "string" &&
        Boolean(String(mergedUpdate.kind).trim());
      const toolKind = hasKind
        ? String(mergedUpdate.kind).trim()
        : existing?.toolKind;
      const hasTitle =
        typeof mergedUpdate.title === "string" &&
        Boolean(String(mergedUpdate.title).trim());
      // ACP patch semantics: omitted title/kind leave prior values. Avoid
      // inventing a generic "Tool" title on status-only updates.
      const titleFromAgent = hasTitle
        ? String(mergedUpdate.title).trim()
        : existing && !isGenericToolTitle(existing.title)
          ? existing.title
          : "";
      const diff = toolDiffFromUpdate(mergedUpdate) ?? existing?.diff;
      // Present from the merged payload so a late status frame still has the path.
      const presentation = deriveToolActivityPresentation({
        titleFromAgent,
        toolKind,
        update: mergedUpdate,
        existingDetail: existing?.detail,
        diffPath: diff?.path,
      });
      const status =
        parseActivityStatus(mergedUpdate.status) ??
        existing?.status ??
        "in_progress";
      const activity: AgentChatActivityItem = {
        id: toolCallId,
        kind: "tool",
        title: presentation.summary,
        detail: presentation.detail,
        status,
        toolKind,
        diff,
        collapseKey: `tool:${toolCallId}`,
      };
      const toolingPhase =
        state.phase === "responding" ? "responding" : "tooling";

      // T3 shouldEmitToolCallUpdate: hold until detail exists; skip unchanged.
      if (
        !shouldEmitToolActivity({
          detail: activity.detail,
          title: activity.title,
          status: activity.status,
          alreadyVisible: Boolean(existingVisible),
          previousTitle: existingVisible?.title,
          previousDetail: existingVisible?.detail,
        })
      ) {
        return {
          ...state,
          toolCallPayloads,
          pendingTools: { ...state.pendingTools, [toolCallId]: activity },
          phase: toolingPhase,
        };
      }

      const { [toolCallId]: _removed, ...restPending } = state.pendingTools;
      const segments = upsertActivityInSegments(state.segments, activity);
      return {
        ...state,
        toolCallPayloads,
        pendingTools: restPending,
        segments,
        activities: activitiesFromSegments(segments),
        // Keep responding if we already streamed text — next tools open a new
        // work segment below that text.
        phase: toolingPhase,
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
      pendingTools: {},
      toolCallPayloads: {},
    },
    update,
  ).activities;
}

export function formatDiffStat(diff: AgentChatActivityDiff): string {
  const parts: string[] = [];
  if (diff.additions > 0) parts.push(`+${diff.additions}`);
  if (diff.deletions > 0) parts.push(`−${diff.deletions}`);
  return parts.join(" ") || "diff";
}
