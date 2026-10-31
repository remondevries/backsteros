import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chatThreadStickAnchor,
  isChatViewportNearBottom,
} from "./chat-thread-stick-to-bottom.js";

describe("isChatViewportNearBottom", () => {
  it("treats a flush bottom as near", () => {
    assert.equal(
      isChatViewportNearBottom({
        scrollHeight: 1000,
        scrollTop: 800,
        clientHeight: 200,
      }),
      true,
    );
  });

  it("treats content that fits without scrolling as near", () => {
    assert.equal(
      isChatViewportNearBottom({
        scrollHeight: 100,
        scrollTop: 0,
        clientHeight: 200,
      }),
      true,
    );
  });

  it("treats a mid-thread position as away", () => {
    assert.equal(
      isChatViewportNearBottom({
        scrollHeight: 2000,
        scrollTop: 0,
        clientHeight: 400,
      }),
      false,
    );
  });
});

describe("chatThreadStickAnchor", () => {
  it("changes when the peer or message bounds change", () => {
    const a = chatThreadStickAnchor("p1", [{ id: "m1" }, { id: "m2" }]);
    const b = chatThreadStickAnchor("p1", [{ id: "m1" }, { id: "m3" }]);
    const c = chatThreadStickAnchor("p2", [{ id: "m1" }, { id: "m2" }]);
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  it("uses a stable empty sentinel", () => {
    assert.equal(chatThreadStickAnchor("p1", []), "p1:empty");
  });
});
