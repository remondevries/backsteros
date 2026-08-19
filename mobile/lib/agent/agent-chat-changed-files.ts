import type {
  AgentChatActivityDiffLine,
  AgentChatActivityItem,
} from "./agent-chat-activity";
import type { AgentChatMessage } from "./agent-chat-message";

export type AgentChatChangedFile = {
  path: string;
  name: string;
  additions: number;
  deletions: number;
  lines: AgentChatActivityDiffLine[];
};

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

/**
 * Prefer live-turn edits; otherwise the most recent assistant turn that
 * produced file changes.
 */
export function latestAgentChatChangedFiles(
  messages: readonly AgentChatMessage[],
  liveActivities?: readonly AgentChatActivityItem[],
): AgentChatChangedFile[] {
  const live = collectChangedFilesFromActivities(liveActivities);
  if (live.length > 0) return live;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "assistant") continue;
    const files = collectChangedFilesFromActivities(message.activities);
    if (files.length > 0) return files;
  }
  return [];
}

/** Latest assistant plan payload for the Plan surface. */
export function latestAgentChatPlan(messages: readonly AgentChatMessage[]): {
  proposedPlanMarkdown: string | null;
  planSteps: NonNullable<AgentChatMessage["planSteps"]>;
} {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== "assistant") continue;
    const markdown = message.proposedPlanMarkdown?.trim() || null;
    const steps = message.planSteps ?? [];
    if (markdown || steps.length > 0) {
      return { proposedPlanMarkdown: markdown, planSteps: [...steps] };
    }
  }
  return { proposedPlanMarkdown: null, planSteps: [] };
}
