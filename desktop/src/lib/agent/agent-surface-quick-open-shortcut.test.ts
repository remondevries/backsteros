import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agentSurfaceQuickOpenHotkeyLabel,
  listAgentSurfaceQuickOpenKinds,
  resolveAgentSurfaceDigitShortcut,
  resolveAgentSurfaceQuickOpenShortcut,
} from "./agent-surface-quick-open-shortcut.ts";

test("codebase projects expose Agent / Browser / Files / Plan / Diff when diffs exist", () => {
  assert.deepEqual(
    listAgentSurfaceQuickOpenKinds({
      isCodebaseProject: true,
      diffAvailable: true,
    }),
    ["chat", "browser", "files", "plan", "diff"],
  );
  // Boolean shorthand keeps Diff (legacy callers / tests).
  assert.deepEqual(listAgentSurfaceQuickOpenKinds(true), [
    "chat",
    "browser",
    "files",
    "plan",
    "diff",
  ]);
});

test("codebase projects hide Diff until there are file changes", () => {
  assert.deepEqual(
    listAgentSurfaceQuickOpenKinds({
      isCodebaseProject: true,
      diffAvailable: false,
    }),
    ["chat", "browser", "files", "plan"],
  );
});

test("non-codebase projects hide Files and Diff", () => {
  assert.deepEqual(listAgentSurfaceQuickOpenKinds(false), [
    "chat",
    "browser",
    "plan",
  ]);
});

test("⌘1–⌘5 map by visible options on codebase projects when empty", () => {
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit1",
      },
      true,
    ),
    "chat",
  );
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit3",
      },
      true,
    ),
    "files",
  );
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit5",
      },
      true,
    ),
    "diff",
  );
});

test("⌘5 is unavailable on codebase projects when Diff is hidden", () => {
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit5",
      },
      { isCodebaseProject: true, diffAvailable: false },
    ),
    null,
  );
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit4",
      },
      { isCodebaseProject: true, diffAvailable: false },
    ),
    "plan",
  );
});

test("⌘3 is Plan on non-codebase projects when empty", () => {
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit3",
      },
      false,
    ),
    "plan",
  );
  assert.equal(
    resolveAgentSurfaceQuickOpenShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit4",
      },
      false,
    ),
    null,
  );
});

test("hotkey labels follow visible order", () => {
  assert.equal(agentSurfaceQuickOpenHotkeyLabel("chat", true), "⌘1");
  assert.equal(agentSurfaceQuickOpenHotkeyLabel("files", true), "⌘3");
  assert.equal(agentSurfaceQuickOpenHotkeyLabel("plan", false), "⌘3");
  assert.equal(agentSurfaceQuickOpenHotkeyLabel("files", false), "");
  assert.equal(
    agentSurfaceQuickOpenHotkeyLabel("diff", {
      isCodebaseProject: true,
      diffAvailable: false,
    }),
    "",
  );
});

test("with open tabs, ⌘N activates tab index instead of creating surfaces", () => {
  assert.deepEqual(
    resolveAgentSurfaceDigitShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit1",
      },
      { isCodebaseProject: true, tabCount: 3 },
    ),
    { action: "activate-tab", index: 0 },
  );
  assert.deepEqual(
    resolveAgentSurfaceDigitShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit2",
      },
      { isCodebaseProject: true, tabCount: 3 },
    ),
    { action: "activate-tab", index: 1 },
  );
  assert.deepEqual(
    resolveAgentSurfaceDigitShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit3",
      },
      { isCodebaseProject: true, tabCount: 3 },
    ),
    { action: "activate-tab", index: 2 },
  );
  assert.equal(
    resolveAgentSurfaceDigitShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit4",
      },
      { isCodebaseProject: true, tabCount: 3 },
    ),
    null,
  );
});

test("with no tabs, digit shortcut still quick-opens", () => {
  assert.deepEqual(
    resolveAgentSurfaceDigitShortcut(
      {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        code: "Digit2",
      },
      { isCodebaseProject: false, tabCount: 0 },
    ),
    { action: "quick-open", kind: "browser" },
  );
});
