import { describe, expect, it } from "vitest";

import { isAnyPopupLayerOpen } from "./isBacksterosPropertyMenuOpen";

function fakeDocument(matches: (selector: string) => boolean): ParentNode {
  return {
    querySelector: (selector: string) => (matches(selector) ? ({} as Element) : null),
  } as unknown as ParentNode;
}

describe("isAnyPopupLayerOpen", () => {
  it("is false without a document", () => {
    expect(isAnyPopupLayerOpen(null)).toBe(false);
  });

  it("queries open and closing menu popups", () => {
    let queried = "";
    const doc = fakeDocument((selector) => {
      queried = selector;
      return true;
    });
    expect(isAnyPopupLayerOpen(doc)).toBe(true);
    expect(queried).toContain('[data-slot="menu-popup"]:is([data-open],[data-ending-style])');
    expect(queried).toContain('[data-slot="popover-popup"]');
    expect(queried).toContain('[data-slot="dialog-popup"]');
  });

  it("is false when no popup layer matches", () => {
    expect(isAnyPopupLayerOpen(fakeDocument(() => false))).toBe(false);
  });
});
