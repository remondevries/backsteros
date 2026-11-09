import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { selectChromeHeader } from "./chrome-header-context.js";

describe("selectChromeHeader", () => {
  test("empty registry yields null (no empty placeholder bar)", () => {
    assert.equal(selectChromeHeader([]), null);
  });

  test("higher priority wins; releasing it reveals the lower trail", () => {
    const page = "page-trail";
    const room = "room-controls";
    const both = [
      { priority: 0, header: page },
      { priority: 10, header: room },
    ];
    assert.equal(selectChromeHeader(both), room);

    const afterRoomClosed = both.filter((entry) => entry.priority === 0);
    assert.equal(selectChromeHeader(afterRoomClosed), page);
  });

  test("equal priority keeps the later registration", () => {
    assert.equal(
      selectChromeHeader([
        { priority: 0, header: "first" },
        { priority: 0, header: "second" },
      ]),
      "second",
    );
  });
});
