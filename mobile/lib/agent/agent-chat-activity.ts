/**
 * ACP activity / plan types for mobile chat + diff (mirrors desktop
 * `agent-acp-activity` + plan steps — data only, no UI).
 */

export type AgentChatActivityStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type AgentChatActivityDiffLine = {
  type: "add" | "del" | "ctx";
  text: string;
};

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
  toolKind?: string;
  diff?: AgentChatActivityDiff;
};

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

export type AgentChatPlanStepStatus = "pending" | "inProgress" | "completed";

export type AgentChatPlanStep = {
  step: string;
  status: AgentChatPlanStepStatus;
};

export function normalizeActivities(
  raw: unknown,
): AgentChatActivityItem[] | undefined {
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
    let diff: AgentChatActivityDiff | undefined;
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
              return { type: l.type, text: l.text } as AgentChatActivityDiffLine;
            })
            .filter((line): line is AgentChatActivityDiffLine => line != null)
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

export function normalizeSegments(
  raw: unknown,
): AgentChatTurnSegment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AgentChatTurnSegment[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id.trim()) continue;
    if (item.kind === "text") {
      if (typeof item.text !== "string" || !item.text.trim()) continue;
      out.push({ id: item.id.trim(), kind: "text", text: item.text });
      continue;
    }
    if (item.kind === "work") {
      const activities = normalizeActivities(item.activities);
      if (!activities || activities.length === 0) continue;
      out.push({ id: item.id.trim(), kind: "work", activities });
    }
  }
  return out.length > 0 ? out : undefined;
}

export function normalizePlanSteps(
  raw: unknown,
): AgentChatPlanStep[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AgentChatPlanStep[] = [];
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

export function preferPlanSteps(
  existing: readonly AgentChatPlanStep[] | undefined,
  incoming: readonly AgentChatPlanStep[] | undefined,
): AgentChatPlanStep[] | undefined {
  const next = incoming ?? [];
  const prev = existing ?? [];
  if (next.length === 0) {
    return prev.length > 0 ? prev.map((step) => ({ ...step })) : undefined;
  }
  if (prev.length === 0 || next.length >= prev.length) {
    return next.map((step) => ({ ...step }));
  }
  return prev.map((step) => ({ ...step }));
}

export function formatDiffStat(diff: {
  additions: number;
  deletions: number;
}): string {
  const parts: string[] = [];
  if (diff.additions > 0) parts.push(`+${diff.additions}`);
  if (diff.deletions > 0) parts.push(`−${diff.deletions}`);
  return parts.join(" ") || "0";
}

export function formatChatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 1) return "<1s";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function turnFoldLabel(options: {
  outcome?: "completed" | "interrupted" | "failed" | null;
  startedAt?: number | null;
  endedAt?: number | null;
  activityCount: number;
}): string {
  const started = options.startedAt ?? null;
  const ended = options.endedAt ?? null;
  let duration = "";
  if (started != null && ended != null && ended >= started) {
    duration = formatChatDuration(ended - started);
  }
  if (options.outcome === "interrupted") {
    return duration
      ? `You stopped after ${duration}`
      : "You stopped this response";
  }
  if (duration) return `Worked for ${duration}`;
  if (options.activityCount > 0) {
    return `Worked · ${options.activityCount} step${
      options.activityCount === 1 ? "" : "s"
    }`;
  }
  return "Worked";
}
