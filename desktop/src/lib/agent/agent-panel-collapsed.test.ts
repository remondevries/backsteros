import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  agentPanelCollapsedKey,
  readAgentPanelCollapsed,
  writeAgentPanelCollapsed,
} from "./agent-panel-collapsed.ts";

const memory = new Map<string, string>();

const localStorageMock = {
  getItem(key: string) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  setItem(key: string, value: string) {
    memory.set(key, String(value));
  },
  removeItem(key: string) {
    memory.delete(key);
  },
};

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: localStorageMock },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

afterEach(() => {
  memory.clear();
});

describe("agent-panel-collapsed", () => {
  it("returns the fallback when nothing is stored", () => {
    assert.equal(readAgentPanelCollapsed("task", false), false);
    assert.equal(readAgentPanelCollapsed("email", true), true);
  });

  it("keeps task and email preferences independent", () => {
    writeAgentPanelCollapsed("task", true);
    writeAgentPanelCollapsed("email", false);
    assert.equal(readAgentPanelCollapsed("task", false), true);
    assert.equal(readAgentPanelCollapsed("email", true), false);
    assert.equal(memory.get(agentPanelCollapsedKey("task")), "1");
    assert.equal(memory.get(agentPanelCollapsedKey("email")), "0");
  });
});
