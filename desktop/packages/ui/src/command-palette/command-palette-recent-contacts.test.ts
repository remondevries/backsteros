import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCommandPaletteContactsListScope,
  selectRecentCommandPaletteContacts,
} from "./command-palette.js";

describe("selectRecentCommandPaletteContacts", () => {
  it("returns the most recently updated contacts up to the limit", () => {
    const selected = selectRecentCommandPaletteContacts(
      [
        { id: "a", title: "A", href: "/contacts/a", updatedAt: 1 },
        { id: "b", title: "B", href: "/contacts/b", updatedAt: 30 },
        { id: "c", title: "C", href: "/contacts/c", updatedAt: 20 },
        { id: "d", title: "D", href: "/contacts/d", updatedAt: 10 },
      ],
      3,
    );

    assert.deepEqual(
      selected.map((entry) => entry.id),
      ["b", "c", "d"],
    );
  });

  it("treats missing updatedAt as oldest", () => {
    const selected = selectRecentCommandPaletteContacts(
      [
        { id: "old", title: "Old", href: "/contacts/old" },
        { id: "new", title: "New", href: "/contacts/new", updatedAt: 5 },
      ],
      10,
    );

    assert.deepEqual(
      selected.map((entry) => entry.id),
      ["new", "old"],
    );
  });
});

describe("isCommandPaletteContactsListScope", () => {
  it("is true for contacts filter mode", () => {
    assert.equal(
      isCommandPaletteContactsListScope({
        filterMode: "contacts",
        searchContext: null,
      }),
      true,
    );
  });

  it("is true for contacts route context", () => {
    assert.equal(
      isCommandPaletteContactsListScope({
        filterMode: "all",
        searchContext: { kind: "contacts" },
      }),
      true,
    );
  });

  it("is false otherwise", () => {
    assert.equal(
      isCommandPaletteContactsListScope({
        filterMode: "all",
        searchContext: { kind: "tasks" },
      }),
      false,
    );
  });
});
