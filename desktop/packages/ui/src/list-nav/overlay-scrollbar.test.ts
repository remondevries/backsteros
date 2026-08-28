import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  OVERLAY_SCROLLBAR_MIN_THUMB_PX,
  OVERLAY_SCROLLBAR_THUMB_WIDTH_PX,
  computeOverlayScrollbarFixedBox,
  computeOverlayScrollbarThumb,
} from "./overlay-scrollbar.js";

describe("computeOverlayScrollbarThumb", () => {
  test("hides when content fits the viewport", () => {
    assert.deepEqual(
      computeOverlayScrollbarThumb({
        viewport: 400,
        content: 200,
        scrollTop: 0,
      }),
      { thumbTop: 0, thumbHeight: 0, visible: false },
    );
    assert.deepEqual(
      computeOverlayScrollbarThumb({
        viewport: 400,
        content: 400,
        scrollTop: 0,
      }),
      { thumbTop: 0, thumbHeight: 0, visible: false },
    );
  });

  test("hides for empty or zero viewport", () => {
    assert.equal(
      computeOverlayScrollbarThumb({
        viewport: 0,
        content: 1000,
        scrollTop: 0,
      }).visible,
      false,
    );
    assert.equal(
      computeOverlayScrollbarThumb({
        viewport: 400,
        content: 0,
        scrollTop: 0,
      }).visible,
      false,
    );
  });

  test("sizes the thumb proportional to the viewport / content ratio", () => {
    const metrics = computeOverlayScrollbarThumb({
      viewport: 400,
      content: 800,
      scrollTop: 0,
      minThumbPx: 20,
    });
    assert.equal(metrics.visible, true);
    assert.equal(metrics.thumbHeight, 200);
    assert.equal(metrics.thumbTop, 0);
  });

  test("clamps to the minimum thumb height for very long content", () => {
    const metrics = computeOverlayScrollbarThumb({
      viewport: 400,
      content: 40_000,
      scrollTop: 0,
    });
    assert.equal(metrics.visible, true);
    assert.equal(metrics.thumbHeight, OVERLAY_SCROLLBAR_MIN_THUMB_PX);
    assert.equal(metrics.thumbTop, 0);
  });

  test("places the thumb at mid-scroll and end-scroll", () => {
    const mid = computeOverlayScrollbarThumb({
      viewport: 400,
      content: 800,
      scrollTop: 200,
      minThumbPx: 20,
    });
    assert.equal(mid.thumbHeight, 200);
    assert.equal(mid.thumbTop, 100);

    const end = computeOverlayScrollbarThumb({
      viewport: 400,
      content: 800,
      scrollTop: 400,
      minThumbPx: 20,
    });
    assert.equal(end.thumbHeight, 200);
    assert.equal(end.thumbTop, 200);
  });

  test("clamps scrollTop outside the scrollable range", () => {
    const before = computeOverlayScrollbarThumb({
      viewport: 400,
      content: 800,
      scrollTop: -50,
      minThumbPx: 20,
    });
    assert.equal(before.thumbTop, 0);

    const after = computeOverlayScrollbarThumb({
      viewport: 400,
      content: 800,
      scrollTop: 9999,
      minThumbPx: 20,
    });
    assert.equal(after.thumbTop, 200);
  });
});

describe("computeOverlayScrollbarFixedBox", () => {
  test("pins the thumb to the right edge of the scrollport", () => {
    assert.deepEqual(
      computeOverlayScrollbarFixedBox({
        portTop: 100,
        portRight: 800,
        thumbTop: 40,
        thumbHeight: 120,
      }),
      {
        top: 140,
        left: 800 - OVERLAY_SCROLLBAR_THUMB_WIDTH_PX,
        width: OVERLAY_SCROLLBAR_THUMB_WIDTH_PX,
        height: 120,
      },
    );
  });
});
