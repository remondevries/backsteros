import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compactMinimapPreview,
  deriveTimelineMinimapItems,
  resolveTimelineMinimapHasPersistentGutter,
  resolveTimelineMinimapHeightStyle,
  resolveTimelineMinimapHitStripWidth,
  resolveTimelineMinimapIndexFromPointer,
  resolveTimelineMinimapInteractiveWidth,
  resolveTimelineMinimapTopPercent,
  resolveTimelineRowHeight,
  resolveTimelineRowTop,
} from "./timeline-minimap.ts";
import type { AgentChatTimelineRow } from "../agent-chat-timeline-rows.ts";

describe("timeline minimap helpers", () => {
  it("sizes the rail from item spacing", () => {
    assert.equal(
      resolveTimelineMinimapHeightStyle(5),
      "min(32px, calc(100vh - 18rem))",
    );
  });

  it("maps pointer Y to the nearest item index", () => {
    assert.equal(resolveTimelineMinimapTopPercent(2, 5), 50);
    assert.equal(
      resolveTimelineMinimapIndexFromPointer({
        itemCount: 5,
        railTop: 0,
        railHeight: 100,
        pointerY: 50,
      }),
      2,
    );
    assert.equal(
      resolveTimelineMinimapIndexFromPointer({
        itemCount: 5,
        railTop: 0,
        railHeight: 100,
        pointerY: 0,
      }),
      0,
    );
  });

  it("only keeps a persistent gutter when side space is wide enough", () => {
    assert.equal(resolveTimelineMinimapHasPersistentGutter(832), false);
    assert.equal(resolveTimelineMinimapHasPersistentGutter(863), false);
    assert.equal(resolveTimelineMinimapHasPersistentGutter(864), true);
  });

  it("caps the hit strip to the side gutter", () => {
    assert.equal(resolveTimelineMinimapHitStripWidth(768), 0);
    // (900 - 768) / 2 = 66 → min(40, 66 - 12) = 40
    assert.equal(resolveTimelineMinimapHitStripWidth(900), 40);
    assert.equal(
      resolveTimelineMinimapInteractiveWidth(40, true),
      "22rem",
    );
    assert.equal(resolveTimelineMinimapInteractiveWidth(40, false), 40);
  });

  it("compacts preview text", () => {
    assert.equal(compactMinimapPreview("  hello\nworld  "), "hello world");
    assert.equal(compactMinimapPreview("   "), null);
  });

  it("derives one mark per user turn", () => {
    const rows: AgentChatTimelineRow[] = [
      {
        kind: "user",
        id: "user:u1",
        message: {
          id: "u1",
          role: "user",
          text: "Hi",
          createdAt: 1,
        },
        turnEndIndex: 1,
      },
      {
        kind: "assistant",
        id: "assistant:a1",
        message: {
          id: "a1",
          role: "assistant",
          text: "Hello there",
          createdAt: 2,
        },
        startedAt: 1,
        isLatestTurn: true,
      },
      {
        kind: "user",
        id: "user:u2",
        message: {
          id: "u2",
          role: "user",
          text: "Next",
          createdAt: 3,
        },
        turnEndIndex: 2,
      },
    ];
    const items = deriveTimelineMinimapItems(rows);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.userText, "Hi");
    assert.equal(items[0]?.assistantText, "Hello there");
    assert.equal(items[0]?.rowIndex, 0);
    assert.equal(items[1]?.rowIndex, 2);
  });

  it("reads row top/height from list state", () => {
    const state = {
      positionAtIndex: (index: number) => (index === 1 ? 120 : undefined),
      sizeAtIndex: (index: number) => (index === 1 ? 40 : undefined),
    };
    assert.equal(resolveTimelineRowTop(state, 1), 120);
    assert.equal(resolveTimelineRowHeight(state, 1), 40);
    assert.equal(resolveTimelineRowTop(state, 0), null);
  });
});
