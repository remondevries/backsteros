import { describe, expect, it } from "vitest";

import type { AgentChatActivityItem } from "./agent-acp-activity";
import {
  aggregateToolActivities,
  formatAggregatedToolLabel,
} from "./tool-activity-aggregate";

function tool(
  id: string,
  toolKind: string,
  status: AgentChatActivityItem["status"] = "completed",
): AgentChatActivityItem {
  return {
    id,
    kind: "tool",
    title: toolKind,
    toolKind,
    status,
    detail: `${id}.ts`,
  };
}

describe("tool activity aggregate", () => {
  it("formats mixed read/grep labels", () => {
    expect(formatAggregatedToolLabel(["read", "search"], 4)).toBe(
      "Read, grepped 4 files",
    );
    expect(formatAggregatedToolLabel(["read"], 1)).toBe("Read 1 file");
    expect(formatAggregatedToolLabel(["search"], 2)).toBe("Grepped 2 files");
  });

  it("groups consecutive reads/searches", () => {
    const entries = aggregateToolActivities([
      tool("r1", "read"),
      tool("g1", "grep"),
      tool("r2", "read"),
      tool("e1", "edit"),
      tool("r3", "read"),
      tool("r4", "read"),
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      kind: "group",
      label: "Read, grepped 3 files",
    });
    expect(entries[1]).toMatchObject({ kind: "single", item: { id: "e1" } });
    expect(entries[2]).toMatchObject({
      kind: "group",
      label: "Read 2 files",
    });
  });

  it("keeps live in-progress tools as singles", () => {
    const entries = aggregateToolActivities(
      [
        tool("r1", "read"),
        tool("r2", "read", "in_progress"),
      ],
      { live: true },
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === "single")).toBe(true);
  });
});
