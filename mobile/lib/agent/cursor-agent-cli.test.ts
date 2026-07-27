import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cursorAgentResumeCommand,
  resolveAgentTerminalAction,
} from "./cursor-agent-cli.ts";

describe("resolveAgentTerminalAction", () => {
  it("resumes when TUI is closed", () => {
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: false,
        requestedChatId: "11111111-1111-1111-1111-111111111111",
      }),
      "shell-resume",
    );
  });

  it("noops when already attached without prompt", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    assert.equal(
      resolveAgentTerminalAction({
        tuiOpen: true,
        attachedChatId: id,
        requestedChatId: id,
      }),
      "noop",
    );
  });
});

describe("cursorAgentResumeCommand", () => {
  it("quotes prompts safely", () => {
    assert.equal(
      cursorAgentResumeCommand("11111111-1111-1111-1111-111111111111", "say hi"),
      "agent --resume 11111111-1111-1111-1111-111111111111 'say hi'\n",
    );
  });
});
