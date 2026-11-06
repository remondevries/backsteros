import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALPHA_LETTER_MINIMAP_ITEM_SPACING_PX,
  alphaLetterIndexFromPointer,
  alphaLetterMinimapHeightStyle,
  alphaLetterTopPercent,
} from "./alpha-letter-minimap-logic.js";

describe("alpha letter minimap pointer mapping", () => {
  it("maps top / mid / bottom of the rail to first / mid / last letter", () => {
    const letters = ["A", "B", "C", "D", "E"];
    const railTop = 100;
    const railHeight = 400;
    assert.equal(
      alphaLetterIndexFromPointer({
        letterCount: letters.length,
        railTop,
        railHeight,
        pointerY: railTop,
      }),
      0,
    );
    assert.equal(
      alphaLetterIndexFromPointer({
        letterCount: letters.length,
        railTop,
        railHeight,
        pointerY: railTop + railHeight / 2,
      }),
      2,
    );
    assert.equal(
      alphaLetterIndexFromPointer({
        letterCount: letters.length,
        railTop,
        railHeight,
        pointerY: railTop + railHeight,
      }),
      4,
    );
  });

  it("clamps pointer positions outside the rail", () => {
    assert.equal(
      alphaLetterIndexFromPointer({
        letterCount: 3,
        railTop: 0,
        railHeight: 100,
        pointerY: -20,
      }),
      0,
    );
    assert.equal(
      alphaLetterIndexFromPointer({
        letterCount: 3,
        railTop: 0,
        railHeight: 100,
        pointerY: 140,
      }),
      2,
    );
  });

  it("spaces ticks evenly from 0% to 100%", () => {
    assert.equal(alphaLetterTopPercent(0, 4), 0);
    assert.ok(Math.abs(alphaLetterTopPercent(1, 4) - 100 / 3) < 1e-9);
    assert.equal(alphaLetterTopPercent(3, 4), 100);
    assert.equal(alphaLetterTopPercent(0, 1), 50);
  });

  it("sizes the rail from letter spacing instead of full viewport height", () => {
    assert.equal(
      alphaLetterMinimapHeightStyle(5),
      `min(${4 * ALPHA_LETTER_MINIMAP_ITEM_SPACING_PX}px, min(70vh, 420px))`,
    );
    assert.equal(
      alphaLetterMinimapHeightStyle(2),
      `min(${ALPHA_LETTER_MINIMAP_ITEM_SPACING_PX}px, min(70vh, 420px))`,
    );
  });
});
