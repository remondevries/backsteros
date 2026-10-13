import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getUniqueListItemRouteParam,
  resolveListItemFromSlug,
} from "./entity-routes.js";

describe("resolveListItemFromSlug", () => {
  const items = [
    { id: "judith-id", number: 9, key: "newcon71", name: "Judith" },
    { id: "simone-id", number: 17, key: "newcon71", name: "Simone de Vries" },
  ];

  it("resolves by unique number", () => {
    assert.equal(resolveListItemFromSlug(items, "17")?.id, "simone-id");
    assert.equal(resolveListItemFromSlug(items, "9")?.id, "judith-id");
  });

  it("resolves by id", () => {
    assert.equal(resolveListItemFromSlug(items, "simone-id")?.id, "simone-id");
  });

  it("does not resolve an ambiguous shared key", () => {
    assert.equal(resolveListItemFromSlug(items, "newcon71"), null);
  });
});

describe("getUniqueListItemRouteParam", () => {
  const items = [
    { id: "judith-id", number: 9, key: "newcon71" },
    { id: "simone-id", number: 17, key: "newcon71" },
  ];

  it("prefers unique number over a colliding key", () => {
    assert.equal(getUniqueListItemRouteParam(items[1]!, items), "17");
    assert.equal(getUniqueListItemRouteParam(items[0]!, items), "9");
  });

  it("falls back to id when number and key collide", () => {
    const collided = [
      { id: "a", number: 1, key: "same" },
      { id: "b", number: 1, key: "same" },
    ];
    assert.equal(getUniqueListItemRouteParam(collided[0]!, collided), "a");
  });
});
