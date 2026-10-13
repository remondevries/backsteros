import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveEmailBodyViewModeFromDigitKey,
  resolveEmailBodyViewModeFromShortcut,
} from "./email-body-view-mode-shortcuts.js";

describe("email body view mode shortcuts", () => {
  it("maps 1–3 to plain, rendered, and source", () => {
    assert.equal(resolveEmailBodyViewModeFromDigitKey("1"), "plain");
    assert.equal(resolveEmailBodyViewModeFromDigitKey("2"), "rendered");
    assert.equal(resolveEmailBodyViewModeFromDigitKey("3"), "source");
    assert.equal(resolveEmailBodyViewModeFromDigitKey("4"), null);
    assert.equal(resolveEmailBodyViewModeFromDigitKey("a"), null);
  });

  it("resolveEmailBodyViewModeFromShortcut uses digit keys directly", () => {
    assert.equal(
      resolveEmailBodyViewModeFromShortcut("plain", { key: "2" }),
      "rendered",
    );
    assert.equal(
      resolveEmailBodyViewModeFromShortcut("source", { key: "1" }),
      "plain",
    );
  });
});
