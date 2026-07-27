import type {
  AgentChatActivityItem,
  AgentChatTurnSegment,
} from "./agent-acp-activity";

export type AgentChatRole = "user" | "assistant";

export type AgentChatImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  /** Raw base64 payload (no data: prefix). Omitted after reload if stripped. */
  dataBase64?: string;
};

export type AgentChatMessage = {
  id: string;
  role: AgentChatRole;
  text: string;
  createdAt: number;
  /** Tool / thinking timeline for this assistant turn (T3-style). */
  activities?: AgentChatActivityItem[];
  /**
   * Interleaved work/text blocks (tools → text → tools → text).
   * When absent, UI falls back to activities + text.
   */
  segments?: AgentChatTurnSegment[];
  /** Checklist from `cursor/update_todos` for this turn. */
  planSteps?: import("./t3-port/cursor-todos").AgentChatPlanStep[];
  /** Proposed plan markdown from `cursor/create_plan`. */
  proposedPlanMarkdown?: string | null;
  /**
   * Epoch ms when the agent turn started (composer send / first frame).
   * Persisted so "Worked for…" survives sync without relying on user message
   * pairing alone.
   */
  workedStartedAt?: number | null;
  /** User-attached images for this turn. */
  images?: AgentChatImageAttachment[];
  /** `git rev-parse HEAD` at user send time — used for workspace revert. */
  gitHeadSha?: string | null;
  /** Unified patches of files changed in this assistant turn (for reverse apply). */
  checkpointPatches?: string[];
};

const STORAGE_PREFIX = "backsteros-desktop.agent-chat-transcript.";

function storageKey(chatId: string): string {
  return `${STORAGE_PREFIX}${chatId.trim().toLowerCase()}`;
}

function newMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeActivities(raw: unknown): AgentChatActivityItem[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AgentChatActivityItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
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
    const diffRaw = item.diff;
    let diff: AgentChatActivityItem["diff"];
    if (diffRaw && typeof diffRaw === "object") {
      const d = diffRaw as Record<string, unknown>;
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
              const l = line as Record<string, unknown>;
              if (l.type !== "add" && l.type !== "del" && l.type !== "ctx") {
                return null;
              }
              if (typeof l.text !== "string") return null;
              return { type: l.type, text: l.text };
            })
            .filter(
              (
                line,
              ): line is { type: "add" | "del" | "ctx"; text: string } =>
                line != null,
            )
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

function normalizeSegments(raw: unknown): AgentChatTurnSegment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AgentChatTurnSegment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
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

function normalizeImages(raw: unknown): AgentChatImageAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AgentChatImageAttachment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const mimeType =
      typeof item.mimeType === "string" ? item.mimeType.trim() : "";
    if (!id || !name || !mimeType.startsWith("image/")) continue;
    const dataBase64 =
      typeof item.dataBase64 === "string" && item.dataBase64.trim()
        ? item.dataBase64.trim()
        : undefined;
    out.push({ id, name, mimeType, ...(dataBase64 ? { dataBase64 } : {}) });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeCheckpointPatches(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return out.length > 0 ? out : undefined;
}

function normalizePlanSteps(
  raw: unknown,
): import("./t3-port/cursor-todos").AgentChatPlanStep[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: import("./t3-port/cursor-todos").AgentChatPlanStep[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
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

function normalizeMessage(entry: unknown): AgentChatMessage | null {
  if (!entry || typeof entry !== "object") return null;
  const message = entry as AgentChatMessage;
  if (typeof message.id !== "string") return null;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (typeof message.text !== "string") return null;
  if (typeof message.createdAt !== "number") return null;
  const raw = entry as Record<string, unknown>;
  const proposedPlanMarkdown =
    typeof raw.proposedPlanMarkdown === "string" &&
    raw.proposedPlanMarkdown.trim()
      ? raw.proposedPlanMarkdown
      : undefined;
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    activities: normalizeActivities(raw.activities),
    segments: normalizeSegments(raw.segments),
    planSteps: normalizePlanSteps(raw.planSteps),
    ...(proposedPlanMarkdown ? { proposedPlanMarkdown } : {}),
    workedStartedAt:
      typeof raw.workedStartedAt === "number" &&
      Number.isFinite(raw.workedStartedAt)
        ? raw.workedStartedAt
        : undefined,
    images: normalizeImages(raw.images),
    gitHeadSha:
      typeof raw.gitHeadSha === "string" && raw.gitHeadSha.trim()
        ? raw.gitHeadSha.trim()
        : raw.gitHeadSha === null
          ? null
          : undefined,
    checkpointPatches: normalizeCheckpointPatches(raw.checkpointPatches),
  };
}

export function loadAgentChatTranscript(chatId: string | null | undefined): AgentChatMessage[] {
  const id = chatId?.trim();
  if (!id || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeMessage(entry))
      .filter((entry): entry is AgentChatMessage => entry != null);
  } catch {
    return [];
  }
}

export function saveAgentChatTranscript(
  chatId: string | null | undefined,
  messages: readonly AgentChatMessage[],
): void {
  const id = chatId?.trim();
  if (!id || typeof window === "undefined") return;
  try {
    // Strip large image payloads so localStorage stays under quota; keep metadata.
    const slim = messages.map((message) => {
      if (!message.images?.length) return message;
      return {
        ...message,
        images: message.images.map((image) => ({
          id: image.id,
          name: image.name,
          mimeType: image.mimeType,
        })),
      };
    });
    window.localStorage.setItem(storageKey(id), JSON.stringify(slim));
  } catch {
    /* ignore quota */
  }
}

/** Wipe local + sidecar transcript for a chat (best-effort remote). */
export async function clearAgentChatTranscript(
  chatId: string | null | undefined,
): Promise<void> {
  const id = chatId?.trim().toLowerCase();
  if (!id) return;
  saveAgentChatTranscript(id, []);
  try {
    const { putAgentChatTranscript } = await import("../pty");
    await putAgentChatTranscript(id, []);
  } catch {
    /* ignore offline */
  }
}

export function createAgentChatMessage(
  role: AgentChatRole,
  text: string,
  options?: {
    activities?: readonly AgentChatActivityItem[];
    segments?: readonly AgentChatTurnSegment[];
    planSteps?: readonly import("./t3-port/cursor-todos").AgentChatPlanStep[];
    proposedPlanMarkdown?: string | null;
    workedStartedAt?: number | null;
    images?: readonly AgentChatImageAttachment[];
    gitHeadSha?: string | null;
    checkpointPatches?: readonly string[];
  },
): AgentChatMessage {
  const activities =
    options?.activities && options.activities.length > 0
      ? options.activities.map((item) => ({ ...item }))
      : undefined;
  const segments =
    options?.segments && options.segments.length > 0
      ? options.segments.map((segment) =>
          segment.kind === "text"
            ? { ...segment }
            : {
                ...segment,
                activities: segment.activities.map((item) => ({ ...item })),
              },
        )
      : undefined;
  const planSteps =
    options?.planSteps && options.planSteps.length > 0
      ? options.planSteps.map((step) => ({ ...step }))
      : undefined;
  const images =
    options?.images && options.images.length > 0
      ? options.images.map((image) => ({ ...image }))
      : undefined;
  const checkpointPatches =
    options?.checkpointPatches && options.checkpointPatches.length > 0
      ? [...options.checkpointPatches]
      : undefined;
  return {
    id: newMessageId(),
    role,
    text: text.trim(),
    createdAt: Date.now(),
    ...(activities ? { activities } : {}),
    ...(segments ? { segments } : {}),
    ...(planSteps ? { planSteps } : {}),
    ...(options?.proposedPlanMarkdown
      ? { proposedPlanMarkdown: options.proposedPlanMarkdown }
      : {}),
    ...(options?.workedStartedAt != null
      ? { workedStartedAt: options.workedStartedAt }
      : {}),
    ...(images ? { images } : {}),
    ...(options?.gitHeadSha !== undefined
      ? { gitHeadSha: options.gitHeadSha }
      : {}),
    ...(checkpointPatches ? { checkpointPatches } : {}),
  };
}

/**
 * Load shared transcript from the laptop PTY sidecar.
 * Migrates / merges device-local history when the sidecar is missing turns.
 */
export async function syncAgentChatTranscript(
  chatId: string | null | undefined,
): Promise<AgentChatMessage[]> {
  const id = chatId?.trim().toLowerCase();
  if (!id) return [];
  const local = loadAgentChatTranscript(id);
  const {
    fetchAgentChatTranscript,
    putAgentChatTranscript,
  } = await import("../pty");
  const remote = await fetchAgentChatTranscript(id);
  if (!remote.ok) return local;

  const merged = mergeTranscriptMessages(remote.messages, local);
  if (transcriptNeedsRemoteUpdate(remote.messages, merged)) {
    const put = await putAgentChatTranscript(id, merged);
    if (put.ok) {
      saveAgentChatTranscript(id, put.messages);
      return put.messages;
    }
  }

  // Always return the merge so a hook-written turn without activities cannot
  // wipe a locally finalized "Worked for…" timeline on the next poll.
  saveAgentChatTranscript(id, merged);
  return merged;
}

function mergeTranscriptMessages(
  a: readonly AgentChatMessage[],
  b: readonly AgentChatMessage[],
): AgentChatMessage[] {
  const byId = new Map<string, AgentChatMessage>();
  const byKey = new Map<string, AgentChatMessage>();

  function mergeOne(message: AgentChatMessage) {
    const existingById = byId.get(message.id);
    if (existingById) {
      const existingActivityCount = existingById.activities?.length ?? 0;
      const nextActivityCount = message.activities?.length ?? 0;
      const preferNewerActivities = nextActivityCount > existingActivityCount;
      const existingSegmentCount = existingById.segments?.length ?? 0;
      const nextSegmentCount = message.segments?.length ?? 0;
      const preferNewerSegments = nextSegmentCount > existingSegmentCount;
      const existingPlanCount = existingById.planSteps?.length ?? 0;
      const nextPlanCount = message.planSteps?.length ?? 0;
      const preferNewerPlans = nextPlanCount > existingPlanCount;
      const merged: AgentChatMessage = {
        ...existingById,
        ...message,
        text: message.text.trim() || existingById.text,
        activities: preferNewerActivities
          ? message.activities
          : existingById.activities ?? message.activities,
        segments: preferNewerSegments
          ? message.segments
          : existingById.segments ?? message.segments,
        planSteps: preferNewerPlans
          ? message.planSteps
          : existingById.planSteps ?? message.planSteps,
        proposedPlanMarkdown:
          message.proposedPlanMarkdown?.trim() ||
          existingById.proposedPlanMarkdown ||
          message.proposedPlanMarkdown,
        workedStartedAt:
          existingById.workedStartedAt ?? message.workedStartedAt ?? null,
        id: existingById.id,
        createdAt: Math.min(existingById.createdAt, message.createdAt),
      };
      byId.set(message.id, merged);
      const key = `${merged.role}:${merged.text}`;
      byKey.set(key, merged);
      return;
    }

    const key = `${message.role}:${message.text}`;
    const existing = byKey.get(key);
    if (!existing) {
      byId.set(message.id, message);
      byKey.set(key, message);
      return;
    }
    const existingActivityCount = existing.activities?.length ?? 0;
    const nextActivityCount = message.activities?.length ?? 0;
    const preferNewerActivities = nextActivityCount > existingActivityCount;
    const existingSegmentCount = existing.segments?.length ?? 0;
    const nextSegmentCount = message.segments?.length ?? 0;
    const preferNewerSegments = nextSegmentCount > existingSegmentCount;
    const existingPlanCount = existing.planSteps?.length ?? 0;
    const nextPlanCount = message.planSteps?.length ?? 0;
    const preferNewerPlans = nextPlanCount > existingPlanCount;
    const merged: AgentChatMessage = {
      ...existing,
      ...message,
      text: message.text.trim() || existing.text,
      // Never drop a richer activity timeline — sync/hooks often race without it.
      activities: preferNewerActivities
        ? message.activities
        : existing.activities ?? message.activities,
      segments: preferNewerSegments
        ? message.segments
        : existing.segments ?? message.segments,
      planSteps: preferNewerPlans
        ? message.planSteps
        : existing.planSteps ?? message.planSteps,
      proposedPlanMarkdown:
        message.proposedPlanMarkdown?.trim() ||
        existing.proposedPlanMarkdown ||
        message.proposedPlanMarkdown,
      workedStartedAt:
        existing.workedStartedAt ?? message.workedStartedAt ?? null,
      id:
        preferNewerActivities ||
        preferNewerSegments ||
        existingActivityCount === 0
          ? message.id || existing.id
          : existing.id,
      createdAt: Math.min(existing.createdAt, message.createdAt),
    };
    byId.delete(existing.id);
    byId.set(merged.id, merged);
    byKey.set(key, merged);
  }

  for (const message of [...a, ...b]) {
    mergeOne(message);
  }
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt);
}

/** Merge two transcript histories, keeping the richer activity timeline per turn. */
export function mergeAgentChatTranscripts(
  a: readonly AgentChatMessage[],
  b: readonly AgentChatMessage[],
): AgentChatMessage[] {
  return mergeTranscriptMessages(a, b);
}

function transcriptNeedsRemoteUpdate(
  remote: readonly AgentChatMessage[],
  merged: readonly AgentChatMessage[],
): boolean {
  if (merged.length !== remote.length) return true;
  if (remote.length === 0 && merged.length > 0) return true;
  for (const message of merged) {
    if (!message.activities?.length) continue;
    const remoteMatch = remote.find(
      (entry) => entry.role === message.role && entry.text === message.text,
    );
    if (!(remoteMatch?.activities && remoteMatch.activities.length > 0)) {
      return true;
    }
  }
  return false;
}

/** Append one message to the shared sidecar store (best-effort). */
export function publishAgentChatTranscriptMessage(
  chatId: string | null | undefined,
  message: AgentChatMessage,
): void {
  const id = chatId?.trim().toLowerCase();
  if (!id) return;
  void import("../pty").then(({ appendAgentChatTranscriptMessage }) => {
    void appendAgentChatTranscriptMessage(id, message);
  });
}

/** Upsert in-progress / sealed assistant timeline to the sidecar (best-effort). */
export function publishAgentChatTranscriptTimeline(
  chatId: string | null | undefined,
  patch: {
    id?: string;
    text?: string;
    createdAt?: number;
    activities?: AgentChatMessage["activities"];
    segments?: AgentChatMessage["segments"];
    planSteps?: AgentChatMessage["planSteps"];
    proposedPlanMarkdown?: string | null;
    workedStartedAt?: number | null;
  },
): void {
  const id = chatId?.trim().toLowerCase();
  if (!id) return;
  void import("../pty").then(({ upsertAgentChatTranscriptTimeline }) => {
    void upsertAgentChatTranscriptTimeline(id, patch);
  });
}

const VIEW_STORAGE_KEY = "backsteros-desktop.agent-chat-view";
const CODEBASE_VIEW_STORAGE_KEY = "backsteros-desktop.agent-chat-view.codebase";

export type AgentChatViewMode = "chat" | "terminal";

/** Where Chat/Terminal tabs appear — scopes the persisted preference. */
export type AgentChatViewScope = "rail" | "codebase";

function viewStorageKey(scope: AgentChatViewScope): string {
  return scope === "codebase" ? CODEBASE_VIEW_STORAGE_KEY : VIEW_STORAGE_KEY;
}

function defaultViewMode(scope: AgentChatViewScope): AgentChatViewMode {
  // Codebase stays terminal-first while the chat surface is experimental.
  return scope === "codebase" ? "terminal" : "chat";
}

export function readAgentChatViewMode(
  scope: AgentChatViewScope = "rail",
): AgentChatViewMode {
  const fallback = defaultViewMode(scope);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(viewStorageKey(scope));
    if (raw === "terminal") return "terminal";
    if (raw === "chat") return "chat";
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeAgentChatViewMode(
  mode: AgentChatViewMode,
  scope: AgentChatViewScope = "rail",
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(viewStorageKey(scope), mode);
  } catch {
    /* ignore */
  }
}
