import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAskQuestions } from "./agent-chat-ask.ts";

describe("normalizeAskQuestions", () => {
  it("maps allowMultiple and injects OK when options are empty", () => {
    const questions = normalizeAskQuestions([
      {
        id: "q1",
        prompt: "Ship it?",
        allowMultiple: true,
        options: [],
      },
      {
        id: "q2",
        prompt: "Pick",
        options: [{ id: "a", label: "Alpha" }],
      },
    ]);
    assert.equal(questions.length, 2);
    assert.equal(questions[0]?.multiSelect, true);
    assert.deepEqual(questions[0]?.options, [{ id: "ok", label: "OK" }]);
    assert.deepEqual(questions[1]?.options, [{ id: "a", label: "Alpha" }]);
  });
});
