import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isDirectRoleButtonActivationKey,
  shouldHandleGlobalShortcut,
  shouldHandleTabChromeShortcut,
} from "./shortcut-guards.js";

test("shouldHandleTabChromeShortcut allows chrome keys when no modal is open", () => {
  const event = {
    metaKey: true,
    key: "w",
    code: "KeyW",
    target: null,
  } as unknown as KeyboardEvent;

  assert.equal(shouldHandleTabChromeShortcut(event), true);
});

test("shouldHandleGlobalShortcut yields while content edit mode is active", () => {
  const previousDocument = globalThis.document;
  const editMarker = {
    closest: () => null,
  };
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: (selector: string) =>
      selector.includes('data-content-view-mode="edit"') ? [editMarker] : [],
    activeElement: null,
  } as unknown as Document;

  try {
    const event = {
      target: null,
    } as unknown as KeyboardEvent;
    assert.equal(shouldHandleGlobalShortcut(event), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("isDirectRoleButtonActivationKey ignores bubbled keys from children", () => {
  const row = { id: "row" };
  const child = { id: "child" };

  assert.equal(
    isDirectRoleButtonActivationKey({
      key: " ",
      target: child,
      currentTarget: row,
    }),
    false,
  );

  assert.equal(
    isDirectRoleButtonActivationKey({
      key: " ",
      target: row,
      currentTarget: row,
    }),
    true,
  );

  assert.equal(
    isDirectRoleButtonActivationKey({
      key: "Enter",
      target: row,
      currentTarget: row,
    }),
    true,
  );

  assert.equal(
    isDirectRoleButtonActivationKey({
      key: " ",
      repeat: true,
      target: row,
      currentTarget: row,
    }),
    false,
  );
});
