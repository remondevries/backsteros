import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  clearAgentWebhookVerified,
  isAgentWebhookVerified,
  markAgentWebhookVerified,
} from "./shell-agent-webhook-verified.ts";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
});

describe("shell agent webhook verified gate", () => {
  it("marks and clears verification in localStorage", () => {
    const original = globalThis.window;
    // @ts-expect-error test stub
    globalThis.window = {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
      },
    };

    try {
      assert.equal(isAgentWebhookVerified("agent-1"), false);
      markAgentWebhookVerified("agent-1");
      assert.equal(isAgentWebhookVerified("agent-1"), true);
      clearAgentWebhookVerified("agent-1");
      assert.equal(isAgentWebhookVerified("agent-1"), false);
    } finally {
      globalThis.window = original;
    }
  });
});
