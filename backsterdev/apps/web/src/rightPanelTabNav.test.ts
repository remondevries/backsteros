import { describe, expect, it } from "vite-plus/test";

import { resolveAdjacentRightPanelSurfaceId } from "./rightPanelTabNav";

describe("resolveAdjacentRightPanelSurfaceId", () => {
  const ids = ["browser:1", "terminal:a", "diff"];

  it("returns null with fewer than two tabs", () => {
    expect(
      resolveAdjacentRightPanelSurfaceId({
        surfaceIds: ["only"],
        activeSurfaceId: "only",
        direction: "next",
      }),
    ).toBe(null);
    expect(
      resolveAdjacentRightPanelSurfaceId({
        surfaceIds: [],
        activeSurfaceId: null,
        direction: "previous",
      }),
    ).toBe(null);
  });

  it("moves next and previous with wrap-around", () => {
    expect(
      resolveAdjacentRightPanelSurfaceId({
        surfaceIds: ids,
        activeSurfaceId: "browser:1",
        direction: "next",
      }),
    ).toBe("terminal:a");
    expect(
      resolveAdjacentRightPanelSurfaceId({
        surfaceIds: ids,
        activeSurfaceId: "browser:1",
        direction: "previous",
      }),
    ).toBe("diff");
    expect(
      resolveAdjacentRightPanelSurfaceId({
        surfaceIds: ids,
        activeSurfaceId: "diff",
        direction: "next",
      }),
    ).toBe("browser:1");
  });

  it("starts from the first tab when the active id is missing", () => {
    expect(
      resolveAdjacentRightPanelSurfaceId({
        surfaceIds: ids,
        activeSurfaceId: "gone",
        direction: "next",
      }),
    ).toBe("terminal:a");
  });
});
