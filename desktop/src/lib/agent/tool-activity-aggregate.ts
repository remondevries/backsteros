/**
 * Aggregate consecutive read/search tool rows into TUI-style summaries
 * like "Read, grepped 4 files".
 */

import type { AgentChatActivityItem } from "./agent-acp-activity";

export type AggregatableToolKind = "read" | "search";

export type AggregatedActivityGroup = {
  kind: "group";
  id: string;
  label: string;
  items: AgentChatActivityItem[];
  kinds: AggregatableToolKind[];
};

export type AggregatedActivityEntry =
  | { kind: "single"; item: AgentChatActivityItem }
  | AggregatedActivityGroup;

function normalizeToolKind(
  item: AgentChatActivityItem,
): AggregatableToolKind | null {
  if (item.kind !== "tool") return null;
  const kind = (item.toolKind ?? item.title).toLowerCase();
  if (kind.includes("read")) return "read";
  if (
    kind.includes("search") ||
    kind.includes("grep") ||
    kind.includes("find") ||
    kind.includes("glob")
  ) {
    return "search";
  }
  return null;
}

function isAggregatable(item: AgentChatActivityItem, live: boolean): boolean {
  const toolKind = normalizeToolKind(item);
  if (!toolKind) return false;
  // Keep the in-flight tool visible as its own row.
  if (
    live &&
    (item.status === "in_progress" || item.status === "pending")
  ) {
    return false;
  }
  return true;
}

/** Build Cursor-TUI-ish labels: "Read 3 files", "Grepped 2 files", "Read, grepped 4 files". */
export function formatAggregatedToolLabel(
  kinds: readonly AggregatableToolKind[],
  count: number,
): string {
  const hasRead = kinds.includes("read");
  const hasSearch = kinds.includes("search");
  const noun = count === 1 ? "file" : "files";

  if (hasRead && hasSearch) {
    return `Read, grepped ${count} ${noun}`;
  }
  if (hasSearch) {
    return count === 1 ? "Grepped 1 file" : `Grepped ${count} files`;
  }
  if (hasRead) {
    return count === 1 ? "Read 1 file" : `Read ${count} files`;
  }
  return `${count} tool call${count === 1 ? "" : "s"}`;
}

/**
 * Collapse consecutive aggregatable tool rows into group entries.
 * Non-aggregatable items (edits, shell, thought, live in-progress) stay singles.
 */
export function aggregateToolActivities(
  items: readonly AgentChatActivityItem[],
  options?: { live?: boolean; minGroupSize?: number },
): AggregatedActivityEntry[] {
  const live = options?.live === true;
  const minGroupSize = options?.minGroupSize ?? 2;
  const out: AggregatedActivityEntry[] = [];

  let buffer: AgentChatActivityItem[] = [];
  let bufferKinds: AggregatableToolKind[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length < minGroupSize) {
      for (const item of buffer) {
        out.push({ kind: "single", item });
      }
    } else {
      const kinds = [...new Set(bufferKinds)];
      out.push({
        kind: "group",
        id: `agg-${buffer.map((item) => item.id).join("-")}`,
        label: formatAggregatedToolLabel(kinds, buffer.length),
        items: [...buffer],
        kinds,
      });
    }
    buffer = [];
    bufferKinds = [];
  };

  for (const item of items) {
    const toolKind = normalizeToolKind(item);
    if (toolKind && isAggregatable(item, live)) {
      buffer.push(item);
      bufferKinds.push(toolKind);
      continue;
    }
    flush();
    out.push({ kind: "single", item });
  }
  flush();

  return out;
}
