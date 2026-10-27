import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMUNICATION_CREATE_OPTIONS,
  type CommunicationCreateKind,
} from "./communication-create-launcher.js";

describe("COMMUNICATION_CREATE_OPTIONS", () => {
  it("exposes WhatsApp, Instagram, Messenger, Telegram, and Support as available", () => {
    const byKind = new Map(
      COMMUNICATION_CREATE_OPTIONS.map((option) => [option.kind, option]),
    );
    assert.equal(byKind.get("whatsapp")?.available, true);
    assert.equal(byKind.get("instagram")?.available, true);
    assert.equal(byKind.get("messenger")?.available, true);
    assert.equal(byKind.get("chat")?.available, true);
    assert.equal(byKind.get("support")?.available, true);
    assert.equal(byKind.get("x")?.available, false);
  });

  it("keeps unique letter shortcuts for available kinds", () => {
    const available = COMMUNICATION_CREATE_OPTIONS.filter(
      (option) => option.available,
    );
    const shortcuts = available.map((option) => option.shortcut);
    assert.equal(new Set(shortcuts).size, shortcuts.length);
  });

  it("includes the expected create kinds", () => {
    const kinds = COMMUNICATION_CREATE_OPTIONS.map(
      (option) => option.kind,
    ) as CommunicationCreateKind[];
    for (const kind of [
      "email",
      "support",
      "chat",
      "whatsapp",
      "instagram",
      "messenger",
      "x",
    ] as const) {
      assert.ok(kinds.includes(kind), `missing kind ${kind}`);
    }
  });
});
