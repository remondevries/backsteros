import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ModelListItem } from "@cursor/sdk";

import {
  COMPOSER_2_5_FAST_DISPLAY_NAME,
  COMPOSER_2_5_FAST_ID,
  cursorModelOptionsFromCatalog,
  decodeModelSelection,
  encodeModelSelection,
} from "./cursor-model-options.js";

describe("encodeModelSelection / decodeModelSelection", () => {
  it("round-trips base ids", () => {
    assert.equal(encodeModelSelection({ id: "auto" }), "auto");
    assert.deepEqual(decodeModelSelection("auto"), { id: "auto" });
  });

  it("round-trips params", () => {
    const encoded = encodeModelSelection({
      id: "composer-2.5",
      params: [{ id: "fast", value: "false" }],
    });
    assert.equal(encoded, "composer-2.5:fast=false");
    assert.deepEqual(decodeModelSelection(encoded), {
      id: "composer-2.5",
      params: [{ id: "fast", value: "false" }],
    });
  });

  it("maps composer-2.5-fast alias to fast=true", () => {
    assert.deepEqual(decodeModelSelection(COMPOSER_2_5_FAST_ID), {
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
  });
});

describe("cursorModelOptionsFromCatalog", () => {
  it("expands variants and aliases Composer 2.5 Fast", () => {
    const catalog: ModelListItem[] = [
      {
        id: "composer-2.5",
        displayName: "Composer 2.5",
        variants: [
          {
            displayName: "Composer 2.5 Fast",
            params: [{ id: "fast", value: "true" }],
            isDefault: true,
          },
          {
            displayName: "Composer 2.5",
            params: [{ id: "fast", value: "false" }],
          },
        ],
      },
    ];
    const options = cursorModelOptionsFromCatalog(catalog);
    assert.deepEqual(options, [
      {
        id: COMPOSER_2_5_FAST_ID,
        displayName: COMPOSER_2_5_FAST_DISPLAY_NAME,
      },
      {
        id: "composer-2.5:fast=false",
        displayName: "Composer 2.5",
      },
    ]);
  });

  it("injects Composer 2.5 Fast when the catalog omits it", () => {
    const catalog: ModelListItem[] = [
      { id: "auto", displayName: "Auto" },
      { id: "composer-2.5", displayName: "Composer 2.5" },
    ];
    const options = cursorModelOptionsFromCatalog(catalog);
    assert.equal(
      options.some((o) => o.id === COMPOSER_2_5_FAST_ID),
      true,
    );
    assert.equal(
      options.find((o) => o.id === COMPOSER_2_5_FAST_ID)?.displayName,
      COMPOSER_2_5_FAST_DISPLAY_NAME,
    );
    const composerIdx = options.findIndex((o) => o.id === "composer-2.5");
    const fastIdx = options.findIndex((o) => o.id === COMPOSER_2_5_FAST_ID);
    assert.equal(fastIdx, composerIdx + 1);
  });
});
