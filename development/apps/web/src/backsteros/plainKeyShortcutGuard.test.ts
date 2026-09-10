import { describe, expect, it } from "vite-plus/test";

import { shouldYieldPlainKeyHotkey } from "./plainKeyShortcutGuard";

function keyEvent(target: EventTarget | null = null) {
  return {
    key: "j",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target,
  };
}

describe("shouldYieldPlainKeyHotkey", () => {
  it("yields while description edit mode is active", () => {
    expect(
      shouldYieldPlainKeyHotkey(keyEvent(null), {
        contentEditModeActive: true,
        activeElement: null,
      }),
    ).toBe(true);
  });

  it("yields when a typing surface is focused via activeElement", () => {
    const previousHTMLElement = globalThis.HTMLElement;
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

    try {
      const textbox = new FakeHTMLElement();
      const outside = { tagName: "DIV" };
      expect(
        shouldYieldPlainKeyHotkey(keyEvent(outside as unknown as EventTarget), {
          contentEditModeActive: false,
          activeElement: textbox as unknown as EventTarget,
        }),
      ).toBe(true);
    } finally {
      globalThis.HTMLElement = previousHTMLElement;
    }
  });

  it("allows bare keys when focus is outside editors", () => {
    expect(
      shouldYieldPlainKeyHotkey(keyEvent(null), {
        contentEditModeActive: false,
        activeElement: null,
      }),
    ).toBe(false);
  });

  it("does not block mod chords via this guard alone", () => {
    const previousHTMLElement = globalThis.HTMLElement;
    class FakeHTMLElement {
      tagName = "INPUT";
      isContentEditable = false;
      classList = { contains: () => false };
      closest() {
        return null;
      }
    }
    globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;

    try {
      const input = new FakeHTMLElement();
      expect(
        shouldYieldPlainKeyHotkey(
          {
            key: "j",
            metaKey: true,
            ctrlKey: false,
            altKey: false,
            target: input as unknown as EventTarget,
          },
          { contentEditModeActive: false, activeElement: null },
        ),
      ).toBe(false);
    } finally {
      globalThis.HTMLElement = previousHTMLElement;
    }
  });
});
