import { describe, expect, it } from "vite-plus/test";

import { resolveCodebaseListSelection } from "./codebaseListSelection";

describe("resolveCodebaseListSelection", () => {
  it("selects the first id when nothing is selected", () => {
    expect(resolveCodebaseListSelection(["a", "b"], null)).toBe("a");
  });

  it("keeps the selection when it is still in the list", () => {
    expect(resolveCodebaseListSelection(["a", "b", "c"], "b")).toBe("b");
  });

  it("selects the first id when the previous selection is gone", () => {
    expect(resolveCodebaseListSelection(["x", "y"], "gone")).toBe("x");
  });

  it("clears selection when the list is empty", () => {
    expect(resolveCodebaseListSelection([], "a")).toBeNull();
    expect(resolveCodebaseListSelection<string>([], null)).toBeNull();
  });
});
