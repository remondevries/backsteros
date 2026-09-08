import { afterEach, describe, expect, it } from "vitest";

import { isBacksterosContentEditModeActive } from "./contentViewMode";

type FakeEl = {
  closest: (selector: string) => FakeEl | null;
};

function makeDocument(markers: Array<{ mode: string; hidden: boolean }>) {
  return {
    querySelectorAll(selector: string) {
      if (!selector.includes("data-content-view-mode") || !selector.includes("=")) {
        return [];
      }
      const wanted = selector.includes('"edit"') ? "edit" : "preview";
      return markers
        .filter((marker) => marker.mode === wanted)
        .map((marker) => ({
          closest: (sel: string) =>
            marker.hidden &&
            (sel.includes("inert") ||
              sel.includes("data-keep-alive-hidden") ||
              sel.includes("hidden"))
              ? ({} as FakeEl)
              : null,
        }));
    },
  };
}

describe("isBacksterosContentEditModeActive", () => {
  const previousDocument = globalThis.document;

  afterEach(() => {
    globalThis.document = previousDocument;
  });

  it("ignores edit markers under inert / keep-alive-hidden ancestors", () => {
    globalThis.document = makeDocument([{ mode: "edit", hidden: true }]) as unknown as Document;
    expect(isBacksterosContentEditModeActive()).toBe(false);

    globalThis.document = makeDocument([
      { mode: "edit", hidden: true },
      { mode: "edit", hidden: false },
    ]) as unknown as Document;
    expect(isBacksterosContentEditModeActive()).toBe(true);
  });
});
