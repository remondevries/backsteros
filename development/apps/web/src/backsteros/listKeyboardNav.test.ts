import { describe, expect, it } from "vitest";

import {
  getListKeyboardNavTabDirection,
  listKeyboardNavDirection,
  resolveListKeyboardStepTarget,
  shouldHandleListKeyboardActivate,
  shouldHandleListKeyboardNavigation,
  shouldHandleListKeyboardTabNavigation,
  stepListKeyboardIndex,
  stepListKeyboardNavZone,
} from "./listKeyboardNav";
import {
  clearBacksterosGoLeader,
  registerBacksterosGoLeader,
  resetBacksterosGoLeaderForTests,
} from "./backsterosRailMode";

describe("listKeyboardNavDirection", () => {
  it("maps j/k and arrows", () => {
    expect(listKeyboardNavDirection("j")).toBe("down");
    expect(listKeyboardNavDirection("J")).toBe("down");
    expect(listKeyboardNavDirection("ArrowDown")).toBe("down");
    expect(listKeyboardNavDirection("k")).toBe("up");
    expect(listKeyboardNavDirection("K")).toBe("up");
    expect(listKeyboardNavDirection("ArrowUp")).toBe("up");
    expect(listKeyboardNavDirection("Tab")).toBeNull();
  });
});

describe("resolveListKeyboardStepTarget", () => {
  const ids = ["a", "b", "c"];

  it("steps from the selected row and clamps at ends", () => {
    expect(
      resolveListKeyboardStepTarget({
        direction: "down",
        selectedId: "a",
        itemIds: ids,
      }),
    ).toBe("b");
    expect(
      resolveListKeyboardStepTarget({
        direction: "up",
        selectedId: "a",
        itemIds: ids,
      }),
    ).toBe("a");
    expect(
      resolveListKeyboardStepTarget({
        direction: "down",
        selectedId: "c",
        itemIds: ids,
      }),
    ).toBe("c");
  });

  it("lands on an end when nothing is selected", () => {
    expect(
      resolveListKeyboardStepTarget({
        direction: "down",
        selectedId: null,
        itemIds: ids,
      }),
    ).toBe("a");
    expect(
      resolveListKeyboardStepTarget({
        direction: "up",
        selectedId: null,
        itemIds: ids,
      }),
    ).toBe("c");
  });
});

describe("stepListKeyboardIndex", () => {
  it("clamps within bounds", () => {
    expect(stepListKeyboardIndex(0, "down", 3)).toBe(1);
    expect(stepListKeyboardIndex(2, "down", 3)).toBe(2);
    expect(stepListKeyboardIndex(0, "up", 3)).toBe(0);
    expect(stepListKeyboardIndex(-1, "down", 3)).toBe(0);
    expect(stepListKeyboardIndex(-1, "up", 3)).toBe(2);
  });
});

describe("stepListKeyboardNavZone", () => {
  it("cycles when two zones are available", () => {
    expect(stepListKeyboardNavZone("sidepanel", "forward", ["sidepanel", "main"])).toBe("main");
    expect(stepListKeyboardNavZone("main", "forward", ["sidepanel", "main"])).toBe("sidepanel");
    expect(stepListKeyboardNavZone("sidepanel", "backward", ["sidepanel", "main"])).toBe("main");
  });

  it("returns null with a single zone", () => {
    expect(stepListKeyboardNavZone("sidepanel", "forward", ["sidepanel"])).toBeNull();
  });
});

describe("shouldHandleListKeyboardNavigation", () => {
  it("accepts bare j/k and arrows", () => {
    resetBacksterosGoLeaderForTests();
    expect(
      shouldHandleListKeyboardNavigation({
        event: {
          key: "j",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(true);
    expect(
      shouldHandleListKeyboardNavigation({
        event: {
          key: "ArrowUp",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(true);
  });

  it("yields while a Go leader chord is pending", () => {
    resetBacksterosGoLeaderForTests();
    registerBacksterosGoLeader();
    expect(
      shouldHandleListKeyboardNavigation({
        event: {
          key: "j",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(false);
    clearBacksterosGoLeader();
  });

  it("yields to terminal focus and modifiers", () => {
    resetBacksterosGoLeaderForTests();
    expect(
      shouldHandleListKeyboardNavigation({
        event: {
          key: "j",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
        terminalFocus: true,
      }),
    ).toBe(false);
    expect(
      shouldHandleListKeyboardNavigation({
        event: {
          key: "j",
          metaKey: true,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(false);
  });

  it("yields while content edit mode is active", () => {
    resetBacksterosGoLeaderForTests();
    const previousDocument = globalThis.document;
    globalThis.document = {
      querySelectorAll: (selector: string) =>
        selector.includes('data-content-view-mode="edit"') ? [{ closest: () => null }] : [],
      activeElement: null,
    } as unknown as Document;
    try {
      expect(
        shouldHandleListKeyboardNavigation({
          event: {
            key: "j",
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
            repeat: false,
            target: null,
          },
        }),
      ).toBe(false);
    } finally {
      globalThis.document = previousDocument;
    }
  });

  it("yields when focus is in a textbox even if event.target is not", () => {
    resetBacksterosGoLeaderForTests();
    const previousHTMLElement = globalThis.HTMLElement;
    const previousDocument = globalThis.document;

    class FakeHTMLElement {
      tagName = "DIV";
      isContentEditable = false;
      classList = { contains: () => false };
      closest(selector: string) {
        return selector.includes("role='textbox'") || selector.includes('role="textbox"')
          ? this
          : null;
      }
    }
    globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;
    const textbox = new FakeHTMLElement();
    globalThis.document = {
      querySelectorAll: () => [],
      activeElement: textbox,
    } as unknown as Document;

    try {
      expect(
        shouldHandleListKeyboardNavigation({
          event: {
            key: "j",
            metaKey: false,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
            repeat: false,
            target: { id: "outside" } as unknown as EventTarget,
          },
        }),
      ).toBe(false);
    } finally {
      globalThis.HTMLElement = previousHTMLElement;
      globalThis.document = previousDocument;
    }
  });
});

describe("list keyboard Tab helpers", () => {
  it("detects Tab / Shift+Tab", () => {
    expect(
      shouldHandleListKeyboardTabNavigation({
        event: {
          key: "Tab",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(true);
    expect(getListKeyboardNavTabDirection({ shiftKey: true })).toBe("backward");
    expect(getListKeyboardNavTabDirection({ shiftKey: false })).toBe("forward");
  });
});

describe("shouldHandleListKeyboardActivate", () => {
  it("accepts Enter and Space", () => {
    expect(
      shouldHandleListKeyboardActivate({
        event: {
          key: "Enter",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(true);
    expect(
      shouldHandleListKeyboardActivate({
        event: {
          key: " ",
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
          target: null,
        },
      }),
    ).toBe(true);
  });
});
