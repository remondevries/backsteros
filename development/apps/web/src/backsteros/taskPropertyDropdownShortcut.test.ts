import { describe, expect, it } from "vitest";

import { shouldHandleTaskPropertyDropdownShortcut } from "./taskPropertyDropdownShortcut";

type FakeElement = Element & {
  readonly _matches: ReadonlySet<string>;
};

function fakeElement(selectors: readonly string[] = []): FakeElement {
  const matches = new Set(selectors);
  return {
    _matches: matches,
    closest(selector: string) {
      return matches.has(selector) ? this : null;
    },
  } as FakeElement;
}

function keyEvent(
  overrides: Partial<
    Pick<
      KeyboardEvent,
      "key" | "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "repeat" | "target"
    >
  > = {},
): Pick<
  KeyboardEvent,
  "key" | "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "repeat" | "target"
> {
  return {
    key: "s",
    code: "KeyS",
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    target: fakeElement(),
    ...overrides,
  };
}

describe("shouldHandleTaskPropertyDropdownShortcut", () => {
  it("handles plain property letters when focus is outside the chatbox", () => {
    const outside = fakeElement();
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: outside }), {
        activeElement: outside,
      }),
    ).toBe(true);
    expect(
      shouldHandleTaskPropertyDropdownShortcut(
        keyEvent({ key: "p", code: "KeyP", target: outside }),
        { activeElement: outside },
      ),
    ).toBe(true);
  });

  it("yields when the message chatbox is focused", () => {
    const chatbox = fakeElement(['[data-testid="composer-editor"]']);
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: chatbox }), {
        activeElement: chatbox,
      }),
    ).toBe(false);

    const composerForm = fakeElement(['[data-chat-composer-form="true"]']);
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: composerForm }), {
        activeElement: composerForm,
      }),
    ).toBe(false);
  });

  it("still handles hotkeys when focus is outside the chatbox", () => {
    const outside = fakeElement();
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: outside }), {
        activeElement: outside,
        propertyMenuOpen: false,
      }),
    ).toBe(true);
  });

  it("yields while description edit mode is active", () => {
    const outside = fakeElement();
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: outside }), {
        activeElement: outside,
        contentEditModeActive: true,
      }),
    ).toBe(false);
  });

  it("yields while typing in CodeMirror", () => {
    const editor = fakeElement([".cm-editor"]);
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: editor }), {
        activeElement: editor,
      }),
    ).toBe(false);
  });

  it("yields while typing in an open property menu", () => {
    const input = fakeElement(['[data-slot="menu-popup"]']);
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: input }), {
        activeElement: input,
      }),
    ).toBe(false);
  });

  it("yields whenever any property menu is open", () => {
    const outside = fakeElement();
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: outside }), {
        activeElement: outside,
        propertyMenuOpen: true,
      }),
    ).toBe(false);
  });

  it("while compose is open, ignores detail content-edit mode and targets compose", () => {
    const outside = fakeElement();
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: outside }), {
        activeElement: outside,
        contentEditModeActive: true,
        composeModalOpen: true,
        composeTextFieldFocused: false,
      }),
    ).toBe(true);
  });

  it("while compose is open, yields when title or description owns focus", () => {
    const outside = fakeElement();
    expect(
      shouldHandleTaskPropertyDropdownShortcut(keyEvent({ target: outside }), {
        activeElement: outside,
        composeModalOpen: true,
        composeTextFieldFocused: true,
      }),
    ).toBe(false);
  });
});
