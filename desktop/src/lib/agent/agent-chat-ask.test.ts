import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAskAnswersPayload,
  deriveAskProgress,
  normalizeAskQuestions,
  setAskCustomAnswer,
  toggleAskOption,
} from "./agent-chat-ask.ts";

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

describe("ask drafts (T3 pendingUserInput)", () => {
  const question = {
    id: "q1",
    prompt: "Which?",
    options: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ],
    multiSelect: false,
  };

  it("toggles single-select by label and clears custom answer", () => {
    const draft = toggleAskOption(question, { customAnswer: "nope" }, "Alpha");
    assert.deepEqual(draft.selectedOptionLabels, ["Alpha"]);
    assert.equal(draft.customAnswer, "");
  });

  it("toggles multi-select labels", () => {
    const multi = { ...question, multiSelect: true };
    const first = toggleAskOption(multi, undefined, "Alpha");
    const second = toggleAskOption(multi, first, "Beta");
    assert.deepEqual(second.selectedOptionLabels, ["Alpha", "Beta"]);
    const third = toggleAskOption(multi, second, "Alpha");
    assert.deepEqual(third.selectedOptionLabels, ["Beta"]);
  });

  it("custom answer clears option selection", () => {
    const withOption = toggleAskOption(question, undefined, "Alpha");
    const custom = setAskCustomAnswer(withOption, "Something else");
    assert.equal(custom.customAnswer, "Something else");
    assert.equal(custom.selectedOptionLabels, undefined);
  });

  it("deriveAskProgress and buildAskAnswersPayload map labels to option ids", () => {
    const questions = normalizeAskQuestions([
      {
        id: "q1",
        prompt: "One?",
        options: [{ id: "y", label: "Yes" }],
      },
      {
        id: "q2",
        prompt: "Two?",
        allowMultiple: true,
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
    ]);
    const drafts = {
      q1: toggleAskOption(questions[0]!, undefined, "Yes"),
      q2: toggleAskOption(
        questions[1]!,
        toggleAskOption(questions[1]!, undefined, "A"),
        "B",
      ),
    };
    const progress = deriveAskProgress(questions, drafts, 1);
    assert.equal(progress.answeredCount, 2);
    assert.equal(progress.canAdvance, true);
    assert.deepEqual(progress.selectedOptionLabels, ["A", "B"]);
    assert.deepEqual(buildAskAnswersPayload(questions, drafts), [
      { questionId: "q1", selectedOptionIds: ["y"] },
      { questionId: "q2", selectedOptionIds: ["a", "b"] },
    ]);
  });
});
