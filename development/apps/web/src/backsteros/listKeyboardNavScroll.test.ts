import { describe, expect, it } from "vite-plus/test";

import { scrollDeltaToRevealInSafeArea } from "./listKeyboardNavScroll";

describe("scrollDeltaToRevealInSafeArea", () => {
  it("returns 0 when the target is fully inside the safe band", () => {
    expect(
      scrollDeltaToRevealInSafeArea({
        targetTop: 120,
        targetBottom: 156,
        visibleTop: 80,
        visibleBottom: 600,
      }),
    ).toBe(0);
  });

  it("scrolls up when the target sits under a sticky top cover", () => {
    expect(
      scrollDeltaToRevealInSafeArea({
        targetTop: 20,
        targetBottom: 56,
        visibleTop: 40,
        visibleBottom: 600,
      }),
    ).toBe(-20);
  });

  it("scrolls down when the target sits past the bottom of the safe band", () => {
    expect(
      scrollDeltaToRevealInSafeArea({
        targetTop: 580,
        targetBottom: 620,
        visibleTop: 40,
        visibleBottom: 600,
      }),
    ).toBe(20);
  });

  it("aligns the top when the target is taller than the safe band", () => {
    expect(
      scrollDeltaToRevealInSafeArea({
        targetTop: 10,
        targetBottom: 700,
        visibleTop: 40,
        visibleBottom: 600,
      }),
    ).toBe(-30);
  });

  it("returns 0 when the safe band has no height", () => {
    expect(
      scrollDeltaToRevealInSafeArea({
        targetTop: 0,
        targetBottom: 40,
        visibleTop: 100,
        visibleBottom: 100,
      }),
    ).toBe(0);
  });
});
