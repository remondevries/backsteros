import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSelectAllShortcut,
  shouldHandleSelectAllShortcut,
} from "./list-select-all-shortcut.js";
import { handleSelectAllRequest } from "./use-list-select-all-shortcut.js";

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
    >
  > = {},
): Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
> {
  return {
    key: "a",
    code: "KeyA",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("isSelectAllShortcut", () => {
  it("matches ⌘A and Ctrl+A", () => {
    assert.equal(isSelectAllShortcut(keyEvent({ metaKey: true })), true);
    assert.equal(isSelectAllShortcut(keyEvent({ ctrlKey: true })), true);
  });

  it("rejects bare A and modified chords", () => {
    assert.equal(isSelectAllShortcut(keyEvent()), false);
    assert.equal(
      isSelectAllShortcut(keyEvent({ metaKey: true, shiftKey: true })),
      false,
    );
    assert.equal(
      isSelectAllShortcut(keyEvent({ metaKey: true, altKey: true })),
      false,
    );
    assert.equal(
      isSelectAllShortcut(keyEvent({ metaKey: true, key: "b", code: "KeyB" })),
      false,
    );
  });
});

describe("shouldHandleSelectAllShortcut", () => {
  it("respects enabled flag", () => {
    const event = {
      ...keyEvent({ metaKey: true }),
      target: null,
      preventDefault() {},
    } as unknown as KeyboardEvent;
    assert.equal(shouldHandleSelectAllShortcut(event, false), false);
  });
});

describe("handleSelectAllRequest", () => {
  function withDomStubs(run: () => void) {
    const previous = {
      document: globalThis.document,
      HTMLElement: globalThis.HTMLElement,
      HTMLInputElement: globalThis.HTMLInputElement,
      HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    };

    class StubHTMLElement {}
    class StubHTMLInputElement extends StubHTMLElement {}
    class StubHTMLTextAreaElement extends StubHTMLElement {}

    globalThis.HTMLElement = StubHTMLElement as unknown as typeof HTMLElement;
    globalThis.HTMLInputElement =
      StubHTMLInputElement as unknown as typeof HTMLInputElement;
    globalThis.HTMLTextAreaElement =
      StubHTMLTextAreaElement as unknown as typeof HTMLTextAreaElement;

    try {
      run();
    } finally {
      globalThis.document = previous.document;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.HTMLInputElement = previous.HTMLInputElement;
      globalThis.HTMLTextAreaElement = previous.HTMLTextAreaElement;
    }
  }

  it("selects focused editable text while a blocking modal is open", () => {
    withDomStubs(() => {
      let selected = false;
      const input = new (globalThis.HTMLInputElement as unknown as {
        new (): HTMLInputElement;
      })();
      Object.assign(input, {
        tagName: "INPUT",
        disabled: false,
        readOnly: false,
        isContentEditable: false,
        closest: () => null,
        focus() {},
        select() {
          selected = true;
        },
      });

      globalThis.document = {
        querySelector: (selector: string) =>
          selector.includes("[cmdk-dialog]") ? {} : null,
        activeElement: input,
        execCommand: () => false,
      } as unknown as Document;

      assert.equal(handleSelectAllRequest(), true);
      assert.equal(selected, true);
    });
  });

  it("does not fall through to list/page select-all behind a blocking modal", () => {
    withDomStubs(() => {
      let execCommandCalled = false;

      globalThis.document = {
        querySelector: (selector: string) =>
          selector.includes("[cmdk-dialog]") ? {} : null,
        activeElement: null,
        execCommand: () => {
          execCommandCalled = true;
          return true;
        },
      } as unknown as Document;

      assert.equal(handleSelectAllRequest(), false);
      assert.equal(execCommandCalled, false);
    });
  });
});
