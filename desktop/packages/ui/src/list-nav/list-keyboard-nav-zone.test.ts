import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterListKeyboardNavZonesForTab,
  resolveListKeyboardNavTabTargetZone,
} from "./list-keyboard-nav-zone.js";

describe("filterListKeyboardNavZonesForTab", () => {
  it("keeps sidepanel when detail is closed and there is no content list", () => {
    assert.deepEqual(
      filterListKeyboardNavZonesForTab(["sidepanel", "main"], false),
      ["sidepanel", "main"],
    );
  });

  it("drops sidepanel while a detail panel is open", () => {
    assert.deepEqual(
      filterListKeyboardNavZonesForTab(["sidepanel", "main"], true),
      ["main"],
    );
  });

  it("drops sidepanel when main and content lists are both available", () => {
    assert.deepEqual(
      filterListKeyboardNavZonesForTab(
        ["sidepanel", "content", "main"],
        false,
      ),
      ["content", "main"],
    );
  });
});

describe("resolveListKeyboardNavTabTargetZone with detail cycle", () => {
  it("toggles main and content", () => {
    assert.equal(
      resolveListKeyboardNavTabTargetZone(
        "main",
        "forward",
        ["content", "main"],
        true,
      ),
      "content",
    );
    assert.equal(
      resolveListKeyboardNavTabTargetZone(
        "content",
        "forward",
        ["content", "main"],
        true,
      ),
      "main",
    );
  });
});
