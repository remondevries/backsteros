import { describe, expect, it } from "vite-plus/test";

import {
  sameWorkingTaskIdSet,
  stabilizeWorkingTaskIdSet,
  workingTaskIdsKey,
} from "./workingTaskIdSet";

describe("sameWorkingTaskIdSet", () => {
  it("treats equal membership as the same regardless of insertion order", () => {
    const a = new Set(["b", "a"]);
    const b = new Set(["a", "b"]);
    expect(sameWorkingTaskIdSet(a, b)).toBe(true);
  });

  it("detects membership differences", () => {
    expect(sameWorkingTaskIdSet(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(sameWorkingTaskIdSet(new Set(["a"]), new Set(["b"]))).toBe(false);
  });
});

describe("stabilizeWorkingTaskIdSet", () => {
  it("returns the previous Set when membership is unchanged", () => {
    const previous = new Set(["task-1"]);
    const next = new Set(["task-1"]);
    expect(stabilizeWorkingTaskIdSet(previous, next)).toBe(previous);
  });

  it("returns the empty singleton for an empty next set", () => {
    const first = stabilizeWorkingTaskIdSet(null, new Set());
    const second = stabilizeWorkingTaskIdSet(first, new Set());
    expect(first.size).toBe(0);
    expect(second).toBe(first);
  });

  it("returns next when membership changes", () => {
    const previous = new Set(["task-1"]);
    const next = new Set(["task-1", "task-2"]);
    expect(stabilizeWorkingTaskIdSet(previous, next)).toBe(next);
  });
});

describe("workingTaskIdsKey", () => {
  it("is order-independent", () => {
    expect(workingTaskIdsKey(new Set(["b", "a"]))).toBe(workingTaskIdsKey(new Set(["a", "b"])));
  });

  it("changes when membership changes", () => {
    expect(workingTaskIdsKey(new Set(["a"]))).not.toBe(workingTaskIdsKey(new Set(["a", "b"])));
  });
});
