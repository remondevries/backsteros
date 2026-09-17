import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isModClickOpenNewTab } from "./mod-click-new-tab.ts";

describe("isModClickOpenNewTab", () => {
  it("accepts primary-button meta or ctrl clicks", () => {
    assert.equal(isModClickOpenNewTab({ button: 0, metaKey: true, ctrlKey: false, altKey: false }), true);
    assert.equal(isModClickOpenNewTab({ button: 0, metaKey: false, ctrlKey: true, altKey: false }), true);
  });

  it("rejects alt-modified, non-primary, and plain clicks", () => {
    assert.equal(isModClickOpenNewTab({ button: 0, metaKey: true, ctrlKey: false, altKey: true }), false);
    assert.equal(isModClickOpenNewTab({ button: 1, metaKey: true, ctrlKey: false, altKey: false }), false);
    assert.equal(isModClickOpenNewTab({ button: 0, metaKey: false, ctrlKey: false, altKey: false }), false);
  });
});
