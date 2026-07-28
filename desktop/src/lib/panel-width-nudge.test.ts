import assert from "node:assert/strict";
import { test } from "node:test";

import { createPanelWidthNudger } from "./panel-width-nudge.ts";

test("nudge accumulates on the target so hold-to-repeat stays ahead", () => {
  const widths: number[] = [];
  let current = 400;
  const frames: Array<() => void> = [];
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frames.push(() => cb(0));
    return frames.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

  try {
    const nudger = createPanelWidthNudger({
      getWidth: () => current,
      setWidth: (width) => {
        current = width;
        widths.push(width);
      },
      clampWidth: (width) => Math.min(800, Math.max(380, width)),
      ease: 0.5,
      settleEpsilon: 0.5,
    });

    assert.equal(nudger.nudge(80), true);
    assert.equal(nudger.nudge(80), true);
    // Two frames chase toward 560
    frames.shift()?.();
    frames.shift()?.();
    assert.ok(current > 400);
    assert.ok(current <= 560);
    // Drain until settled
    let guard = 0;
    while (nudger.isAnimating() && guard++ < 40) {
      frames.shift()?.();
    }
    assert.equal(Math.round(current), 560);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
