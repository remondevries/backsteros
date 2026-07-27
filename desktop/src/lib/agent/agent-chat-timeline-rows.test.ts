import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agentChatTimelineRowAnchorId,
  deriveAgentChatTimelineRows,
} from "./agent-chat-timeline-rows.ts";
import type { AgentChatMessage } from "./agent-chat-transcript.ts";
import { resolveChatListAnchoredEndSpace } from "./t3-port/chat-list.ts";

function msg(
  partial: Pick<AgentChatMessage, "id" | "role"> &
    Partial<Omit<AgentChatMessage, "id" | "role">>,
): AgentChatMessage {
  return {
    text: partial.text ?? "",
    createdAt: partial.createdAt ?? 1,
    ...partial,
  };
}

describe("deriveAgentChatTimelineRows", () => {
  it("flattens user/assistant pairs into list rows", () => {
    const rows = deriveAgentChatTimelineRows({
      messages: [
        msg({ id: "u1", role: "user", text: "Hi" }),
        msg({ id: "a1", role: "assistant", text: "Hello" }),
      ],
      showTurnChrome: false,
      working: false,
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.kind, "user");
    assert.equal(rows[1]?.kind, "assistant");
    assert.equal(agentChatTimelineRowAnchorId(rows[0]!), "u1");
    assert.equal(agentChatTimelineRowAnchorId(rows[1]!), null);
  });

  it("appends a live row when turn chrome is visible", () => {
    const rows = deriveAgentChatTimelineRows({
      messages: [msg({ id: "u1", role: "user", text: "Go" })],
      showTurnChrome: true,
      working: true,
    });
    assert.equal(rows.at(-1)?.kind, "live");
    assert.equal(rows.length, 2);
  });

  it("suppresses the settled assistant that matches the live turn", () => {
    const rows = deriveAgentChatTimelineRows({
      messages: [
        msg({ id: "u1", role: "user", text: "Go" }),
        msg({ id: "a-live", role: "assistant", text: "…" }),
      ],
      showTurnChrome: true,
      working: true,
      liveTurnMessageId: "a-live",
    });
    assert.deepEqual(
      rows.map((row) => row.kind),
      ["user", "live"],
    );
  });

  it("resolves anchoredEndSpace for the latest user row", () => {
    const rows = deriveAgentChatTimelineRows({
      messages: [
        msg({ id: "u1", role: "user", text: "a" }),
        msg({ id: "a1", role: "assistant", text: "b" }),
        msg({ id: "u2", role: "user", text: "c" }),
      ],
      showTurnChrome: true,
      working: true,
    });
    const space = resolveChatListAnchoredEndSpace(
      rows,
      "u2",
      agentChatTimelineRowAnchorId,
    );
    assert.equal(space?.anchorIndex, 2);
    assert.equal(space?.anchorOffset, 16);
  });
});
