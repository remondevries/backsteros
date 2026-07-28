import type {
  AgentChatActivityDiff,
  AgentChatActivityDiffLine,
  AgentChatActivityItem,
} from "./agent-acp-activity";
import type { AgentChatMessage } from "./agent-chat-transcript";

export type AgentChatChangedFile = {
  path: string;
  name: string;
  additions: number;
  deletions: number;
  /** Merged unified-ish preview lines from ACP tool diffs. */
  lines: AgentChatActivityDiffLine[];
};

export type AgentChatTurnDiffSelection = {
  /** Assistant message id, or `"live"` for the in-flight turn. */
  turnId: string;
  path: string | null;
};

export const CHANGED_FILES_AUTO_EXPAND_FILE_LIMIT = 5;
export const CHANGED_FILES_AUTO_EXPAND_LINE_LIMIT = 200;
export const CHANGED_FILES_PREVIEW_FILE_LIMIT = 3;

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

export function turnWorkedLabel(options: {
  startedAt?: number | null;
  endedAt?: number | null;
  activityCount: number;
}): string {
  const started = options.startedAt ?? null;
  const ended = options.endedAt ?? null;
  if (started != null && ended != null && ended >= started) {
    const duration = formatChatDuration(ended - started);
    if (duration) return `Worked for ${duration}`;
  }
  if (options.activityCount > 0) {
    return `Worked · ${options.activityCount} step${
      options.activityCount === 1 ? "" : "s"
    }`;
  }
  return "Worked";
}

export function changedFileName(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || pathValue;
}

export function summarizeChangedFileStats(
  files: readonly AgentChatChangedFile[],
): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { additions, deletions };
}

export function shouldAutoExpandChangedFiles(
  files: readonly AgentChatChangedFile[],
  isLatestTurn: boolean,
): boolean {
  if (!isLatestTurn || files.length > CHANGED_FILES_AUTO_EXPAND_FILE_LIMIT) {
    return false;
  }
  const stats = summarizeChangedFileStats(files);
  return stats.additions + stats.deletions <= CHANGED_FILES_AUTO_EXPAND_LINE_LIMIT;
}

export function selectChangedFilePreview(
  files: readonly AgentChatChangedFile[],
  limit = CHANGED_FILES_PREVIEW_FILE_LIMIT,
): AgentChatChangedFile[] {
  return files.slice(0, limit);
}

/** Collect unique edited files (with merged diff lines) from a turn timeline. */
export function collectChangedFilesFromActivities(
  activities: readonly AgentChatActivityItem[] | undefined,
): AgentChatChangedFile[] {
  if (!activities?.length) return [];
  const byPath = new Map<string, AgentChatChangedFile>();

  for (const item of activities) {
    if (item.kind !== "tool") continue;
    const kind = item.toolKind?.toLowerCase();
    const isEdit =
      Boolean(item.diff) ||
      kind === "edit" ||
      kind === "write" ||
      kind === "delete" ||
      kind === "move";
    if (!isEdit) continue;

    const path =
      item.diff?.path?.trim() ||
      (item.detail?.includes("/") || item.detail?.includes("\\")
        ? item.detail.trim()
        : "") ||
      item.detail?.trim() ||
      "";
    if (!path) continue;

    const additions = item.diff?.additions ?? 0;
    const deletions = item.diff?.deletions ?? 0;
    const lines = item.diff?.lines ?? [];
    // Skip path-only edit rows with no captured lines/stats — opening them
    // only shows "Stats only: diff." with nothing useful.
    if (lines.length === 0 && additions === 0 && deletions === 0) continue;
    const existing = byPath.get(path);
    if (existing) {
      existing.additions += additions;
      existing.deletions += deletions;
      if (lines.length > 0) {
        if (existing.lines.length > 0) {
          existing.lines.push({ type: "ctx", text: "···" });
        }
        existing.lines.push(...lines);
      }
    } else {
      byPath.set(path, {
        path,
        name: changedFileName(path),
        additions,
        deletions,
        lines: [...lines],
      });
    }
  }

  return [...byPath.values()];
}

export function resolveTurnDiffFiles(options: {
  turnId: string;
  messages: readonly AgentChatMessage[];
  liveActivities?: readonly AgentChatActivityItem[];
}): AgentChatChangedFile[] {
  if (options.turnId === "live") {
    return collectChangedFilesFromActivities(options.liveActivities);
  }
  const message = options.messages.find((entry) => entry.id === options.turnId);
  return collectChangedFilesFromActivities(message?.activities);
}

export function toActivityDiff(
  file: AgentChatChangedFile,
): AgentChatActivityDiff {
  return {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    lines: file.lines,
  };
}

export function previousUserMessageCreatedAt(
  messages: readonly AgentChatMessage[],
  assistantIndex: number,
): number | null {
  for (let i = assistantIndex - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return messages[i]!.createdAt;
  }
  return null;
}
