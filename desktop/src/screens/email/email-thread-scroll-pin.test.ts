import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pinEmailThreadScrollDuringUpdate,
  scheduleEmailThreadScrollRestore,
} from "./email-thread-scroll-pin.ts";

describe("email-thread-scroll-pin", () => {
  it("scheduleEmailThreadScrollRestore reapplies scrollTop and cancels cleanly", () => {
    const rafIds: number[] = [];
    const timeoutIds: number[] = [];
    let rafSeq = 0;
    let timeoutSeq = 0;
    const g = globalThis as typeof globalThis & {
      requestAnimationFrame: (cb: (time: number) => void) => number;
      cancelAnimationFrame: (id: number) => void;
      setTimeout: (cb: () => void, ms?: number) => number;
      clearTimeout: (id: number) => void;
    };
    const originalRaf = g.requestAnimationFrame;
    const originalCancelRaf = g.cancelAnimationFrame;
    const originalSetTimeout = g.setTimeout;
    const originalClearTimeout = g.clearTimeout;

    g.requestAnimationFrame = (cb) => {
      const id = ++rafSeq;
      rafIds.push(id);
      cb(0);
      return id;
    };
    g.cancelAnimationFrame = (id) => {
      const index = rafIds.indexOf(id);
      if (index >= 0) rafIds.splice(index, 1);
    };
    g.setTimeout = ((_cb, _ms) => {
      const id = ++timeoutSeq;
      timeoutIds.push(id);
      return id;
    }) as typeof g.setTimeout;
    g.clearTimeout = ((id) => {
      const index = timeoutIds.indexOf(Number(id));
      if (index >= 0) timeoutIds.splice(index, 1);
    }) as typeof g.clearTimeout;

    try {
      const el = { scrollTop: 0 } as HTMLElement;
      const cancel = scheduleEmailThreadScrollRestore(() => el, 120);
      assert.equal(el.scrollTop, 120);
      cancel();
      assert.equal(rafIds.length, 0);
      assert.equal(timeoutIds.length, 0);
    } finally {
      g.requestAnimationFrame = originalRaf;
      g.cancelAnimationFrame = originalCancelRaf;
      g.setTimeout = originalSetTimeout;
      g.clearTimeout = originalClearTimeout;
    }
  });

  it("pinEmailThreadScrollDuringUpdate runs the update even without a scrollport", () => {
    let ran = false;
    pinEmailThreadScrollDuringUpdate(() => {
      ran = true;
    });
    assert.equal(ran, true);
  });
});
