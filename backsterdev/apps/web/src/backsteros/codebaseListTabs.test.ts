import { describe, expect, it } from "vite-plus/test";

import {
  BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS,
  backsterosCodebaseListTabSearch,
  parseBacksterosCodebaseListTabIndex,
  resolveBacksterosCodebaseListTabAtIndex,
} from "./codebaseListTabs";

describe("parseBacksterosCodebaseListTabIndex", () => {
  it("maps digits 1–9 to 0-based indices", () => {
    expect(parseBacksterosCodebaseListTabIndex("1")).toBe(0);
    expect(parseBacksterosCodebaseListTabIndex("8")).toBe(7);
    expect(parseBacksterosCodebaseListTabIndex("9")).toBe(8);
  });

  it("rejects non-digit keys", () => {
    expect(parseBacksterosCodebaseListTabIndex("0")).toBeNull();
    expect(parseBacksterosCodebaseListTabIndex("a")).toBeNull();
    expect(parseBacksterosCodebaseListTabIndex("Enter")).toBeNull();
  });
});

describe("resolveBacksterosCodebaseListTabAtIndex", () => {
  it("resolves in-range indices to tab values", () => {
    expect(resolveBacksterosCodebaseListTabAtIndex(0)).toBe("overview");
    expect(resolveBacksterosCodebaseListTabAtIndex(1)).toBe("tasks");
    expect(
      resolveBacksterosCodebaseListTabAtIndex(
        BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS.length - 1,
      ),
    ).toBe("settings");
  });

  it("returns null for out-of-range indices", () => {
    expect(resolveBacksterosCodebaseListTabAtIndex(-1)).toBeNull();
    expect(
      resolveBacksterosCodebaseListTabAtIndex(BACKSTEROS_CODEBASE_LIST_TAB_OPTIONS.length),
    ).toBeNull();
  });
});

describe("backsterosCodebaseListTabSearch", () => {
  it("omits overview and keeps other tabs", () => {
    expect(backsterosCodebaseListTabSearch("overview")).toEqual({});
    expect(backsterosCodebaseListTabSearch("tasks")).toEqual({ tab: "tasks" });
  });
});
