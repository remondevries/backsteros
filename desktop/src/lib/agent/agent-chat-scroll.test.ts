import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeAnchoredTurnMetrics,
  createShowDebouncer,
  isNearScrollEnd,
  shouldRevealAnchoredEnd,
} from "./agent-chat-scroll.ts";

describe("agent chat scroll anchoring", () => {
  it("treats the active turn as fitting when it fits above the composer", () => {
    // T3: positions [0, 300, 460], sizes [240, 80, 140] → lastBottom 600
    const metrics = computeAnchoredTurnMetrics({
      anchorTop: 300,
      contentBottom: 600,
      scrollTop: 0,
      viewportHeight: 760,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    assert.equal(metrics?.turnHeight, 300);
    assert.equal(metrics?.usableViewportHeight, 564);
    assert.equal(metrics?.overflowsUsableViewport, false);
    assert.equal(metrics?.targetScrollToRevealEnd, 36);
    assert.equal(metrics?.scrollDeltaToRevealEnd, 36);
    assert.equal(metrics?.endSpace, 264);
  });

  it("targets the real content end instead of any temporary reserved tail", () => {
    // T3: positions [0, 1720, 1880], sizes [1600, 80, 120] → lastBottom 2000
    const metrics = computeAnchoredTurnMetrics({
      anchorTop: 1720,
      contentBottom: 2000,
      scrollTop: 1900,
      viewportHeight: 760,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    assert.equal(metrics?.contentBottom, 2000);
    assert.equal(metrics?.targetScrollToRevealEnd, 1436);
    assert.equal(metrics?.scrollDeltaToRevealEnd, 0);
  });

  it("reports overflow only for the current anchored turn", () => {
    const metrics = computeAnchoredTurnMetrics({
      anchorTop: 900,
      contentBottom: 1480,
      scrollTop: 900,
      viewportHeight: 760,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    assert.equal(metrics?.turnHeight, 580);
    assert.equal(metrics?.usableViewportHeight, 564);
    assert.equal(metrics?.overflowsUsableViewport, true);
  });

  it("returns the minimal positive scroll delta needed to reveal the turn end", () => {
    const metrics = computeAnchoredTurnMetrics({
      anchorTop: 900,
      contentBottom: 1540,
      scrollTop: 900,
      viewportHeight: 760,
      composerOverlayHeight: 180,
      anchorOffset: 16,
    });

    assert.equal(metrics?.contentBottom, 1540);
    assert.equal(metrics?.visibleUsableBottom, 1464);
    assert.equal(metrics?.scrollDeltaToRevealEnd, 76);
    assert.equal(shouldRevealAnchoredEnd(metrics!), true);
  });

  it("subtracts composer height from usable viewport height", () => {
    const withoutComposer = computeAnchoredTurnMetrics({
      anchorTop: 300,
      contentBottom: 770,
      scrollTop: 0,
      viewportHeight: 700,
      composerOverlayHeight: 0,
      anchorOffset: 16,
    });
    const withComposer = computeAnchoredTurnMetrics({
      anchorTop: 300,
      contentBottom: 770,
      scrollTop: 0,
      viewportHeight: 700,
      composerOverlayHeight: 220,
      anchorOffset: 16,
    });

    assert.equal(withoutComposer?.overflowsUsableViewport, false);
    assert.equal(withComposer?.overflowsUsableViewport, true);
  });

  it("shouldRevealAnchoredEnd requires delta > 1", () => {
    assert.equal(shouldRevealAnchoredEnd({ scrollDeltaToRevealEnd: 0 }), false);
    assert.equal(shouldRevealAnchoredEnd({ scrollDeltaToRevealEnd: 1 }), false);
    assert.equal(shouldRevealAnchoredEnd({ scrollDeltaToRevealEnd: 1.1 }), true);
  });

  it("isNearScrollEnd uses remaining distance from the bottom", () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 900,
      clientHeight: 100,
    };
    assert.equal(isNearScrollEnd(el, 48), true);
    assert.equal(isNearScrollEnd({ ...el, scrollTop: 800 }, 48), false);
  });

  it("createShowDebouncer fires once and cancel drops a pending show", async () => {
    let count = 0;
    const debouncer = createShowDebouncer(() => {
      count += 1;
    }, 20);
    debouncer.maybeExecute();
    debouncer.maybeExecute();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(count, 1);

    debouncer.maybeExecute();
    debouncer.cancel();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(count, 1);
  });
});
