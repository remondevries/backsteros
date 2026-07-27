import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveAgentTerminalAction } from "./cursor-agent-cli.ts";

const CHAT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CHAT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("resolveAgentTerminalAction", () => {
  it("aborts destroyed chats", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: false,
        requestedChatId: CHAT_A,
        destroyed: true,
        prompt: "retry",
      }),
      "abort",
    );
  });

  it("aborts empty chat ids", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        requestedChatId: "  ",
      }),
      "abort",
    );
  });

  it("shell-resumes when TUI is closed", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: false,
        attachedChatId: CHAT_A,
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
        prompt: "retry",
      }),
      "shell-resume",
    );
  });

  it("types into TUI when the same attached chat has a prompt", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: CHAT_A,
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
        prompt: "Please retry from where you left off.",
      }),
      "prompt-in-tui",
    );
  });

  it("noops when same chat is already open without a prompt", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: CHAT_A,
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
      }),
      "noop",
    );
  });

  it("types into TUI when attach tracking was lost but bound matches", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: null,
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
        sessionIsNew: false,
        prompt: "continue",
      }),
      "prompt-in-tui",
    );
  });

  it("quits then resumes for a brand-new chat even if TUI is open", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: null,
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
        sessionIsNew: true,
        prompt: "retry",
      }),
      "quit-then-shell-resume",
    );
  });

  it("noops re-entrant Start Agent once the new chat is already attached", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: CHAT_A,
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
        sessionIsNew: true,
        prompt: "Implement this task…",
      }),
      "noop",
    );
  });

  it("quits then resumes when a different chat is attached", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: CHAT_A,
        boundChatId: CHAT_B,
        requestedChatId: CHAT_B,
        prompt: "go",
      }),
      "quit-then-shell-resume",
    );
  });

  it("quits then resumes when open TUI has no same-chat signal", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: null,
        boundChatId: null,
        requestedChatId: CHAT_A,
        sessionIsNew: false,
      }),
      "quit-then-shell-resume",
    );
  });

  it("normalizes chat id casing", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: CHAT_A.toUpperCase(),
        boundChatId: CHAT_A,
        requestedChatId: CHAT_A,
        prompt: "x",
      }),
      "prompt-in-tui",
    );
  });
});
