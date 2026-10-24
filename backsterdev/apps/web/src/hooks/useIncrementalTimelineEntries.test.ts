import { describe, expect, it } from "vite-plus/test";
import {
  sameReadonlyArray,
  sameTimelineEntriesInput,
} from "./useIncrementalTimelineEntries";
import type { TimelineEntriesInput } from "../session-logic";

describe("sameReadonlyArray", () => {
  it("treats equal-content arrays with different identities as the same", () => {
    const item = { id: "a" };
    expect(sameReadonlyArray([item], [item])).toBe(true);
    expect(sameReadonlyArray([], [])).toBe(true);
    expect(sameReadonlyArray(undefined, undefined)).toBe(true);
  });

  it("rejects length or element mismatches", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    expect(sameReadonlyArray([a], [b])).toBe(false);
    expect(sameReadonlyArray([a], [a, b])).toBe(false);
    expect(sameReadonlyArray([], undefined)).toBe(false);
  });
});

describe("sameTimelineEntriesInput", () => {
  it("ignores fresh filter/flatMap wrappers when element identities match", () => {
    const turn = { item: { type: "assistant_message" } } as TimelineEntriesInput["visibleTurnItems"][number];
    const message = { id: "m1" } as TimelineEntriesInput["optimisticMessages"][number];
    const left: TimelineEntriesInput = {
      visibleTurnItems: [turn],
      optimisticMessages: [message],
      anchoredMessages: [message],
    };
    const right: TimelineEntriesInput = {
      visibleTurnItems: [turn],
      optimisticMessages: [message],
      anchoredMessages: [message],
    };
    expect(left.visibleTurnItems).not.toBe(right.visibleTurnItems);
    expect(sameTimelineEntriesInput(left, right)).toBe(true);
  });

  it("detects a real turn-item change", () => {
    const turnA = { item: { type: "assistant_message" } } as TimelineEntriesInput["visibleTurnItems"][number];
    const turnB = { item: { type: "user_message" } } as TimelineEntriesInput["visibleTurnItems"][number];
    const emptyMessages: TimelineEntriesInput["optimisticMessages"] = [];
    expect(
      sameTimelineEntriesInput(
        { visibleTurnItems: [turnA], optimisticMessages: emptyMessages },
        { visibleTurnItems: [turnB], optimisticMessages: emptyMessages },
      ),
    ).toBe(false);
  });
});
