import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isListTypeToFilterChar,
  isListTypeToFilterHoldingEscape,
  isListTypeToFilterToggleShortcut,
  listItemMatchesTypeToFilter,
  setListTypeToFilterQueryActive,
  setListTypeToFilterSearchModeActive,
  isListTypeToFilterSearchModeActive,
} from "./list-type-to-filter.js";
import { shouldHandleGlobalShortcut } from "../shortcuts/shortcut-guards.js";

describe("list-type-to-filter", () => {
  it("matches Shift+F as the search toggle", () => {
    assert.equal(
      isListTypeToFilterToggleShortcut({
        key: "F",
        code: "KeyF",
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      }),
      true,
    );
    assert.equal(
      isListTypeToFilterToggleShortcut({
        key: "f",
        code: "KeyF",
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
      }),
      false,
    );
  });

  it("accepts any printable character for the query", () => {
    assert.equal(isListTypeToFilterChar("a"), true);
    assert.equal(isListTypeToFilterChar("9"), true);
    assert.equal(isListTypeToFilterChar("."), true);
    assert.equal(isListTypeToFilterChar(" "), true);
    assert.equal(isListTypeToFilterChar("@"), true);
    assert.equal(isListTypeToFilterChar("Enter"), false);
  });

  it("matches haystacks case-insensitively", () => {
    assert.equal(
      listItemMatchesTypeToFilter("exam", "Example.com", "ex"),
      true,
    );
    assert.equal(listItemMatchesTypeToFilter("zzz", "example.com"), false);
    assert.equal(listItemMatchesTypeToFilter("", "anything"), true);
  });

  it("suppresses global shortcuts while search mode is active", () => {
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelector: () => null,
      querySelectorAll: () => [],
      activeElement: null,
    } as unknown as Document;

    try {
      setListTypeToFilterSearchModeActive(true);
      assert.equal(isListTypeToFilterSearchModeActive(), true);
      assert.equal(
        shouldHandleGlobalShortcut({ target: null } as unknown as KeyboardEvent),
        false,
      );
    } finally {
      setListTypeToFilterSearchModeActive(false);
      globalThis.document = previousDocument;
    }
  });

  it("holds Escape while a locked filter query is active", () => {
    setListTypeToFilterQueryActive(true);
    try {
      assert.equal(isListTypeToFilterHoldingEscape(), true);
    } finally {
      setListTypeToFilterQueryActive(false);
    }
    assert.equal(isListTypeToFilterHoldingEscape(), false);
  });
});
