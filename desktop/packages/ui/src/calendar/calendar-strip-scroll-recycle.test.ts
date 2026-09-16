import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createCalendarStripRecycleController } from "./calendar-strip-scroll-recycle.js";

describe("createCalendarStripRecycleController", () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let rafQueue: Array<() => void> = [];

  function installRaf() {
    rafQueue = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(() => cb(0));
      return rafQueue.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      rafQueue[id - 1] = () => {};
    }) as typeof cancelAnimationFrame;
  }

  function flushRaf() {
    const pending = rafQueue;
    rafQueue = [];
    for (const cb of pending) cb();
  }

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
    rafQueue = [];
  });

  it("defers shift to rAF and keeps accepting scroll during cooldown", () => {
    installRaf();
    let scroll = 800;
    const shifts: number[] = [];
    const controller = createCalendarStripRecycleController({
      getPaneSize: () => 400,
      getScrollOffset: () => scroll,
      setScrollOffset: (value) => {
        scroll = value;
      },
      paneCount: 5,
      edgeBuffer: 1,
      cooldownMs: 50,
      onShift: (shift) => shifts.push(shift),
    });

    // At the last pane → recycle.
    scroll = 1600;
    controller.afterScroll();
    assert.equal(shifts.length, 0);
    flushRaf();
    assert.equal(shifts.length, 1);
    assert.equal(scroll, 800); // snapped to center (index 2 * 400)

    // Gesture must still move scroll during cooldown.
    scroll += 40;
    assert.equal(controller.isRecycling(), true);
    controller.afterScroll();
    flushRaf();
    assert.equal(shifts.length, 1);

    controller.dispose();
  });

  it("does not drop a follow-up edge after cooldown", async () => {
    installRaf();
    let scroll = 1600;
    const shifts: number[] = [];
    const controller = createCalendarStripRecycleController({
      getPaneSize: () => 400,
      getScrollOffset: () => scroll,
      setScrollOffset: (value) => {
        scroll = value;
      },
      paneCount: 5,
      edgeBuffer: 1,
      cooldownMs: 20,
      onShift: (shift) => shifts.push(shift),
    });

    controller.afterScroll();
    flushRaf();
    assert.equal(shifts.length, 1);

    await new Promise((resolve) => setTimeout(resolve, 30));
    // Cooldown ends with a scheduled check; sit on the edge again.
    scroll = 1600;
    flushRaf();
    // Either the auto re-check or an explicit afterScroll should shift again.
    if (shifts.length === 1) {
      controller.afterScroll();
      flushRaf();
    }
    assert.ok(shifts.length >= 2);
    controller.dispose();
  });
});
