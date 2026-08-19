import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCategoryTree,
  categoryIconDisplay,
  rootCategoryId,
  type FinanceCategoryRow,
} from "./finance-categories";

const row = (
  id: string,
  name: string,
  overrides: Partial<FinanceCategoryRow> = {},
): FinanceCategoryRow => ({
  id,
  name,
  parentId: null,
  kind: "regular",
  listing: "listed",
  icon: null,
  sortOrder: 0,
  ...overrides,
});

describe("buildCategoryTree", () => {
  it("nests children under parents in sort order", () => {
    const tree = buildCategoryTree([
      row("food", "Food", { sortOrder: 1 }),
      row("home", "Home", { sortOrder: 0 }),
      row("rent", "Rent", { parentId: "home", sortOrder: 1 }),
      row("energy", "Energy", { parentId: "home", sortOrder: 0 }),
    ]);

    assert.deepEqual(
      tree.map((node) => node.id),
      ["home", "food"],
    );
    assert.deepEqual(
      tree[0]!.children.map((child) => child.id),
      ["energy", "rent"],
    );
  });

  it("promotes orphans (missing parent) to roots", () => {
    const tree = buildCategoryTree([
      row("orphan", "Orphan", { parentId: "gone" }),
    ]);
    assert.deepEqual(
      tree.map((node) => node.id),
      ["orphan"],
    );
  });
});

describe("rootCategoryId", () => {
  it("walks up to the root", () => {
    const rows = [
      row("home", "Home"),
      row("rent", "Rent", { parentId: "home" }),
    ];
    assert.equal(rootCategoryId("rent", rows), "home");
    assert.equal(rootCategoryId("home", rows), "home");
  });

  it("returns the id itself when unknown", () => {
    assert.equal(rootCategoryId("mystery", []), "mystery");
  });
});

describe("categoryIconDisplay", () => {
  it("returns the emoji for emoji icons", () => {
    assert.deepEqual(categoryIconDisplay('{"t":"e","v":"🍕"}'), {
      emoji: "🍕",
      color: null,
    });
  });

  it("returns the color for dot and named icons", () => {
    assert.deepEqual(categoryIconDisplay('{"t":"d","c":"#22c55e"}'), {
      emoji: null,
      color: "#22c55e",
    });
    assert.deepEqual(categoryIconDisplay('{"t":"i","k":"cart","c":"#38f"}'), {
      emoji: null,
      color: "#38f",
    });
  });

  it("returns empty for null, invalid JSON, and bad colors", () => {
    assert.deepEqual(categoryIconDisplay(null), { emoji: null, color: null });
    assert.deepEqual(categoryIconDisplay("cart"), {
      emoji: null,
      color: null,
    });
    assert.deepEqual(categoryIconDisplay('{"t":"d","c":"green"}'), {
      emoji: null,
      color: null,
    });
  });
});
