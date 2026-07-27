import { describe, expect, it } from "vitest";

import {
  isGenericToolTitle,
  toolActivityHeading,
  toolKindVerb,
} from "./work-entry-labels";

describe("work-entry-labels", () => {
  it("treats literal Tool titles as generic", () => {
    expect(isGenericToolTitle("Tool")).toBe(true);
    expect(isGenericToolTitle("tool call")).toBe(true);
    expect(isGenericToolTitle("Read STRUCTURE.md")).toBe(false);
  });

  it("falls back to kind verbs when the title is generic", () => {
    expect(
      toolActivityHeading({ title: "Tool", toolKind: "search" }),
    ).toBe("Grepped");
    expect(toolActivityHeading({ title: "Tool", toolKind: "read" })).toBe(
      "Read",
    );
    expect(
      toolActivityHeading({ title: "Reading config", toolKind: "read" }),
    ).toBe("Reading config");
  });

  it("maps tool kinds to short verbs", () => {
    expect(toolKindVerb("search")).toBe("Grepped");
    expect(toolKindVerb("read")).toBe("Read");
    expect(toolKindVerb("edit")).toBe("Edited");
  });
});
