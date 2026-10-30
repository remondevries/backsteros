import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveAdjacentChatPeerId,
  resolveChatPeerNavShortcut,
} from "./chat-peer-nav-shortcut.ts";

function keyEvent(
  partial: Partial<
    Pick<
      KeyboardEvent,
      "code" | "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "repeat"
    >
  >,
): KeyboardEvent {
  return {
    code: "KeyJ",
    altKey: true,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    repeat: false,
    ...partial,
  } as KeyboardEvent;
}

test("⌥J / ⌥K resolve left / right", () => {
  assert.equal(resolveChatPeerNavShortcut(keyEvent({ code: "KeyJ" })), "left");
  assert.equal(resolveChatPeerNavShortcut(keyEvent({ code: "KeyK" })), "right");
});

test("rejects plain j/k and ⌘⌥ mixes", () => {
  assert.equal(
    resolveChatPeerNavShortcut(keyEvent({ altKey: false })),
    null,
  );
  assert.equal(
    resolveChatPeerNavShortcut(keyEvent({ metaKey: true })),
    null,
  );
  assert.equal(
    resolveChatPeerNavShortcut(keyEvent({ shiftKey: true })),
    null,
  );
});

test("adjacent peer wraps around the strip", () => {
  const peers = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(resolveAdjacentChatPeerId(peers, "b", "left"), "a");
  assert.equal(resolveAdjacentChatPeerId(peers, "b", "right"), "c");
  assert.equal(resolveAdjacentChatPeerId(peers, "a", "left"), "c");
  assert.equal(resolveAdjacentChatPeerId(peers, "c", "right"), "a");
});
