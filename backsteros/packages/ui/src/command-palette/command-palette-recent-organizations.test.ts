import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCommandPaletteOrganizationsListScope,
  selectRecentCommandPaletteOrganizations,
} from "./command-palette.js";

describe("selectRecentCommandPaletteOrganizations", () => {
  it("returns the most recently updated organizations up to the limit", () => {
    const selected = selectRecentCommandPaletteOrganizations(
      [
        { id: "a", title: "A", href: "/organizations/a", updatedAt: 1 },
        { id: "b", title: "B", href: "/organizations/b", updatedAt: 30 },
        { id: "c", title: "C", href: "/organizations/c", updatedAt: 20 },
        { id: "d", title: "D", href: "/organizations/d", updatedAt: 10 },
      ],
      3,
    );

    assert.deepEqual(
      selected.map((entry) => entry.id),
      ["b", "c", "d"],
    );
  });

  it("treats missing updatedAt as oldest", () => {
    const selected = selectRecentCommandPaletteOrganizations(
      [
        { id: "old", title: "Old", href: "/organizations/old" },
        { id: "new", title: "New", href: "/organizations/new", updatedAt: 5 },
      ],
      10,
    );

    assert.deepEqual(
      selected.map((entry) => entry.id),
      ["new", "old"],
    );
  });
});

describe("isCommandPaletteOrganizationsListScope", () => {
  it("is true for organizations filter mode", () => {
    assert.equal(
      isCommandPaletteOrganizationsListScope({
        filterMode: "organizations",
        searchContext: null,
      }),
      true,
    );
  });

  it("is true for organizations route context", () => {
    assert.equal(
      isCommandPaletteOrganizationsListScope({
        filterMode: "all",
        searchContext: { kind: "organizations" },
      }),
      true,
    );
  });

  it("is false otherwise", () => {
    assert.equal(
      isCommandPaletteOrganizationsListScope({
        filterMode: "all",
        searchContext: { kind: "contacts" },
      }),
      false,
    );
  });
});
