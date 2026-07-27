import type { AgentChatActivityItem } from "./agent-acp-activity";

/** T3 shows only the latest work entry until expanded (`MessagesTimeline.logic`). */
export const MAX_VISIBLE_WORK_LOG_ENTRIES = 1;

export function formatWorkingTimer(startedAtMs: number, endedAtMs: number): string {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return "0s";
  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatWorkingTimerNow(startedAtMs: number): string {
  return formatWorkingTimer(startedAtMs, Date.now());
}

export function formatShortChatTimestamp(createdAt: number): string {
  if (!Number.isFinite(createdAt)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(createdAt));
  } catch {
    return "";
  }
}

export function formatChatTimestampTooltip(createdAt: number): string {
  if (!Number.isFinite(createdAt)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(createdAt));
  } catch {
    return "";
  }
}

export type ActivityTrailingIndicator = "success" | "failed" | "pending" | null;

export function activityTrailingIndicator(
  item: AgentChatActivityItem,
  live: boolean,
): ActivityTrailingIndicator {
  if (item.status === "failed") return "failed";
  if (item.status === "completed") return "success";
  if (item.status === "pending" || item.status === "in_progress") {
    return live ? "pending" : null;
  }
  if (!live && item.kind === "tool") return "success";
  return null;
}

export function activityCompactPreview(item: AgentChatActivityItem): string | null {
  const detail = item.detail?.trim();
  if (!detail) return null;
  const title = item.title.trim().toLowerCase();
  const detailLower = detail.toLowerCase();
  if (detailLower === title) return null;
  // Path already visible in a path-bearing heading (T3-style) — avoid
  // "Reading foo.ts" + "foo.ts".
  if (title.includes(detailLower)) return null;
  return detail;
}

export function splitWorkLogEntries(
  items: readonly AgentChatActivityItem[],
  expanded: boolean,
): {
  visible: AgentChatActivityItem[];
  hiddenCount: number;
} {
  if (expanded || items.length <= MAX_VISIBLE_WORK_LOG_ENTRIES) {
    return { visible: [...items], hiddenCount: 0 };
  }
  const hiddenCount = items.length - MAX_VISIBLE_WORK_LOG_ENTRIES;
  return {
    visible: items.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES),
    hiddenCount,
  };
}

export type ChangedFileTreeNode =
  | {
      kind: "dir";
      name: string;
      path: string;
      children: ChangedFileTreeNode[];
      additions: number;
      deletions: number;
    }
  | {
      kind: "file";
      name: string;
      path: string;
      additions: number;
      deletions: number;
    };

type DirBuilder = {
  name: string;
  path: string;
  dirs: Map<string, DirBuilder>;
  files: ChangedFileTreeNode[];
  additions: number;
  deletions: number;
};

function emptyDir(name: string, path: string): DirBuilder {
  return {
    name,
    path,
    dirs: new Map(),
    files: [],
    additions: 0,
    deletions: 0,
  };
}

function finalizeDir(dir: DirBuilder): ChangedFileTreeNode[] {
  const nodes: ChangedFileTreeNode[] = [];
  for (const child of dir.dirs.values()) {
    nodes.push({
      kind: "dir",
      name: child.name,
      path: child.path,
      children: finalizeDir(child),
      additions: child.additions,
      deletions: child.deletions,
    });
  }
  nodes.push(...dir.files);
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Build a shallow folder tree for the changed-files card (T3-style). */
export function buildChangedFilesTree(
  files: readonly {
    path: string;
    name: string;
    additions: number;
    deletions: number;
  }[],
): ChangedFileTreeNode[] {
  const root = emptyDir("", "");

  for (const file of files) {
    const parts = file.path.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i]!;
      const path = parts.slice(0, i + 1).join("/");
      let next = cursor.dirs.get(name);
      if (!next) {
        next = emptyDir(name, path);
        cursor.dirs.set(name, next);
      }
      next.additions += file.additions;
      next.deletions += file.deletions;
      cursor = next;
    }
    const name = parts[parts.length - 1]!;
    cursor.files.push({
      kind: "file",
      name,
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
    });
    cursor.additions += file.additions;
    cursor.deletions += file.deletions;
  }

  return finalizeDir(root);
}
