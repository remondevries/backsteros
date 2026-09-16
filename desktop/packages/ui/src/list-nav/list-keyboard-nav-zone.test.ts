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

  it("keeps all three calendar columns in the Tab cycle", () => {
    assert.deepEqual(
      filterListKeyboardNavZonesForTab(
        ["sidepanel", "main", "content"],
        false,
        "/calendar",
      ),
      ["sidepanel", "main", "content"],
    );
  });

  it("still drops sidepanel on calendar while a detail pane is open", () => {
    assert.deepEqual(
      filterListKeyboardNavZonesForTab(
        ["sidepanel", "main", "content"],
        true,
        "/calendar",
      ),
      ["main", "content"],
    );
  });
});

describe("resolveListKeyboardNavTabTargetZone with detail cycle", () => {
  it("toggles main and content", () => {
    assert.equal(
      resolveListKeyboardNavTabTargetZone(
        "main",
        "forward",
        ["main", "content"],
        true,
      ),
      "content",
    );
    assert.equal(
      resolveListKeyboardNavTabTargetZone(
        "content",
        "forward",
        ["main", "content"],
        true,
      ),
      "main",
    );
  });

  it("cycles calendar left → grid → meetings", () => {
    const zones = ["sidepanel", "main", "content"] as const;
    assert.equal(
      resolveListKeyboardNavTabTargetZone("sidepanel", "forward", [...zones], true),
      "main",
    );
    assert.equal(
      resolveListKeyboardNavTabTargetZone("main", "forward", [...zones], true),
      "content",
    );
    assert.equal(
      resolveListKeyboardNavTabTargetZone("content", "forward", [...zones], true),
      "sidepanel",
    );
  });
});
