import assert from "node:assert/strict";
import { test } from "node:test";

const { summarizeAskQuestion, normalizeAskQuestionEntry } = await import(
  "./agent-acp-ask.mjs"
);

test("summarizeAskQuestion maps allowMultiple and injects OK when options empty", () => {
  const summary = summarizeAskQuestion({
    questions: [
      {
        id: "q1",
        prompt: "Ship it?",
        allowMultiple: true,
        options: [],
      },
      {
        id: "q2",
        prompt: "Pick one",
        options: [{ id: "a", label: "Alpha" }],
      },
    ],
  });
  assert.equal(summary.title, "Ship it?");
  assert.equal(summary.detail, "2 questions");
  assert.equal(summary.questions[0]?.multiSelect, true);
  assert.deepEqual(summary.questions[0]?.options, [{ id: "ok", label: "OK" }]);
  assert.deepEqual(summary.questions[1]?.options, [
    { id: "a", label: "Alpha" },
  ]);
  assert.deepEqual(summary.options, [{ id: "ok", label: "OK" }]);
});

test("normalizeAskQuestionEntry accepts multiSelect aliases", () => {
  assert.equal(
    normalizeAskQuestionEntry({ prompt: "A", allow_multiple: true }, 0)
      .multiSelect,
    true,
  );
  assert.equal(
    normalizeAskQuestionEntry({ prompt: "B", multiSelect: true }, 1).multiSelect,
    true,
  );
});
