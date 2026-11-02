import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildVerifyPrompt,
  parseVerifyCheckResults,
} from "./task-agent-acp.js";

describe("factory verify ACP helpers", () => {
  it("lists pending checks and asks for a checks fence", () => {
    const prompt = buildVerifyPrompt([
      { key: "typecheck", label: "Typecheck passes" },
      { key: "lint", label: "Lint passes" },
    ]);
    assert.match(prompt, /key=typecheck/);
    assert.match(prompt, /key=lint/);
    assert.match(prompt, /```checks/);
  });

  it("parses a checks fenced JSON array", () => {
    const text = [
      "All good.",
      "```checks",
      JSON.stringify([
        { key: "typecheck", status: "pass", detail: "ok" },
        { key: "lint", status: "FAIL", detail: "eslint", logText: "err" },
      ]),
      "```",
    ].join("\n");
    const parsed = parseVerifyCheckResults(text);
    assert.deepEqual(parsed, [
      { key: "typecheck", status: "pass", detail: "ok" },
      { key: "lint", status: "fail", detail: "eslint", logText: "err" },
    ]);
  });

  it("returns null when no results block is present", () => {
    assert.equal(parseVerifyCheckResults("still working"), null);
  });
});
