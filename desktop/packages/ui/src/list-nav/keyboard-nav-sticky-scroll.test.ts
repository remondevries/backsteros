import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  expandRevealTopForAdjacentHeader,
  scrollDeltaToRevealInSafeArea,
} from "./keyboard-nav-sticky-scroll.js";

describe("scrollDeltaToRevealInSafeArea", () => {
  it("returns 0 when the target is fully inside the safe band", () => {
    assert.equal(
      scrollDeltaToRevealInSafeArea({
        targetTop: 120,
        targetBottom: 156,
        visibleTop: 80,
        visibleBottom: 600,
      }),
      0,
    );
  });

  it("scrolls up when the target sits under a sticky top cover", () => {
    // Sticky header covers 0–40; row at 20–56 is partially hidden.
    assert.equal(
      scrollDeltaToRevealInSafeArea({
        targetTop: 20,
        targetBottom: 56,
        visibleTop: 40,
        visibleBottom: 600,
      }),
      -20,
    );
  });

  it("scrolls down when the target sits past the bottom of the safe band", () => {
    assert.equal(
      scrollDeltaToRevealInSafeArea({
        targetTop: 580,
        targetBottom: 620,
        visibleTop: 40,
        visibleBottom: 600,
      }),
      20,
    );
  });

  it("aligns the top when the target is taller than the safe band", () => {
    assert.equal(
      scrollDeltaToRevealInSafeArea({
        targetTop: 10,
        targetBottom: 700,
        visibleTop: 40,
        visibleBottom: 600,
      }),
      -30,
    );
  });

  it("returns 0 when the safe band has no height", () => {
    assert.equal(
      scrollDeltaToRevealInSafeArea({
        targetTop: 0,
        targetBottom: 40,
        visibleTop: 100,
        visibleBottom: 100,
      }),
      0,
    );
  });
});

describe("expandRevealTopForAdjacentHeader", () => {
  it("pulls reveal top up to an adjacent Overdue-style label", () => {
    // Header just above the viewport; row flush to top after nearest scroll.
    assert.equal(
      expandRevealTopForAdjacentHeader({
        targetTop: 0,
        headerTop: -22,
        headerBottom: 0,
      }),
      -22,
    );
  });

  it("ignores a far-away mid-group header", () => {
    assert.equal(
      expandRevealTopForAdjacentHeader({
        targetTop: 400,
        headerTop: 40,
        headerBottom: 62,
      }),
      400,
    );
  });

  it("returns the row top when no header is present", () => {
    assert.equal(
      expandRevealTopForAdjacentHeader({
        targetTop: 80,
        headerTop: null,
        headerBottom: null,
      }),
      80,
    );
  });
});
