import { describe, expect, it } from "vitest";

import { isBacksterosPropertyMenuOpen } from "./isBacksterosPropertyMenuOpen";

type Queryable = {
  querySelector: (selector: string) => Element | null;
};

function docWith(matches: Record<string, boolean>): ParentNode {
  return {
    querySelector(selector: string) {
      return matches[selector] ? ({} as Element) : null;
    },
  } as unknown as ParentNode;
}

describe("isBacksterosPropertyMenuOpen", () => {
  it("is false when nothing is open", () => {
    expect(isBacksterosPropertyMenuOpen(docWith({}) as Queryable as ParentNode)).toBe(false);
  });

  it("detects an expanded property trigger", () => {
    expect(
      isBacksterosPropertyMenuOpen(
        docWith({
          '[data-task-property-dropdown][aria-expanded="true"]': true,
        }),
      ),
    ).toBe(true);
  });

  it("detects an open property menu popup", () => {
    expect(
      isBacksterosPropertyMenuOpen(
        docWith({
          ".bos-task-property-menu[data-open]": true,
        }),
      ),
    ).toBe(true);
  });
});
