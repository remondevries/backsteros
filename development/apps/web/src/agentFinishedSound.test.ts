import { describe, expect, it } from "vite-plus/test";

import { isAppDocumentFocused, shouldPlayAgentFinishedSound } from "./agentFinishedSound";

function doc(input: {
  visibilityState: DocumentVisibilityState;
  focused: boolean;
}): Pick<Document, "visibilityState" | "hasFocus"> {
  return {
    visibilityState: input.visibilityState,
    hasFocus: () => input.focused,
  };
}

describe("isAppDocumentFocused", () => {
  it("requires a visible and focused document", () => {
    expect(isAppDocumentFocused(doc({ visibilityState: "visible", focused: true }))).toBe(true);
    expect(isAppDocumentFocused(doc({ visibilityState: "visible", focused: false }))).toBe(false);
    expect(isAppDocumentFocused(doc({ visibilityState: "hidden", focused: true }))).toBe(false);
  });
});

describe("shouldPlayAgentFinishedSound", () => {
  const finished = "env:thread-1";

  it("plays when the window is not focused", () => {
    expect(
      shouldPlayAgentFinishedSound({
        finishedThreadKey: finished,
        activeThreadKey: finished,
        doc: doc({ visibilityState: "visible", focused: false }),
      }),
    ).toBe(true);
  });

  it("plays when the tab is hidden even if that chat is active", () => {
    expect(
      shouldPlayAgentFinishedSound({
        finishedThreadKey: finished,
        activeThreadKey: finished,
        doc: doc({ visibilityState: "hidden", focused: true }),
      }),
    ).toBe(true);
  });

  it("skips when the finished chat is focused in a visible window", () => {
    expect(
      shouldPlayAgentFinishedSound({
        finishedThreadKey: finished,
        activeThreadKey: finished,
        doc: doc({ visibilityState: "visible", focused: true }),
      }),
    ).toBe(false);
  });

  it("plays when a different chat is focused", () => {
    expect(
      shouldPlayAgentFinishedSound({
        finishedThreadKey: finished,
        activeThreadKey: "env:thread-2",
        doc: doc({ visibilityState: "visible", focused: true }),
      }),
    ).toBe(true);
  });

  it("plays when no chat is active but the window is focused", () => {
    expect(
      shouldPlayAgentFinishedSound({
        finishedThreadKey: finished,
        activeThreadKey: null,
        doc: doc({ visibilityState: "visible", focused: true }),
      }),
    ).toBe(true);
  });
});
