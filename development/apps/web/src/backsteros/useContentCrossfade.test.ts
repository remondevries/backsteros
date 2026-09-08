import { describe, expect, it } from "vitest";

import {
  BACKSTEROS_CONTENT_CROSSFADE_FALLBACK_MS,
  contentCrossfadeStyle,
  type ContentCrossfadeState,
} from "./useContentCrossfade";

function state(overrides: Partial<ContentCrossfadeState> = {}): ContentCrossfadeState {
  return {
    displayedKey: "a",
    faded: false,
    durationMs: BACKSTEROS_CONTENT_CROSSFADE_FALLBACK_MS,
    animated: true,
    ...overrides,
  };
}

describe("contentCrossfadeStyle", () => {
  it("is fully opaque when not faded", () => {
    expect(contentCrossfadeStyle(state())).toEqual({
      opacity: 1,
      transition: `opacity ${BACKSTEROS_CONTENT_CROSSFADE_FALLBACK_MS}ms ease`,
    });
  });

  it("is transparent while fading out", () => {
    expect(contentCrossfadeStyle(state({ faded: true })).opacity).toBe(0);
  });

  it("skips transition when duration is zero", () => {
    expect(contentCrossfadeStyle(state({ durationMs: 0, faded: true }))).toEqual({
      opacity: 0,
      transition: undefined,
    });
  });
});
