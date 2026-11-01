import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanCursorTranscriptText,
  extractCursorContentParts,
  mergeCursorMessageParts,
  parseCursorTranscriptLine,
} from "./cursor-agent-transcript.mjs";

test("cleanCursorTranscriptText extracts user_query body", () => {
  const text = cleanCursorTranscriptText(
    `<timestamp>Sunday</timestamp>\n<user_query>\nhello there\n</user_query>`,
  );
  assert.equal(text, "hello there");
});

test("parseCursorTranscriptLine keeps text + tool_use parts", () => {
  const parsed = parseCursorTranscriptLine(
    JSON.stringify({
      role: "assistant",
      message: {
        content: [
          { type: "text", text: "Looking that up." },
          {
            type: "tool_use",
            name: "Read",
            input: { path: "/tmp/x" },
          },
        ],
      },
    }),
  );
  assert.equal(parsed?.role, "assistant");
  assert.equal(parsed?.parts.length, 2);
  assert.equal(parsed?.parts[0]?.type, "text");
  assert.equal(parsed?.parts[0]?.text, "Looking that up.");
  assert.equal(parsed?.parts[1]?.type, "tool-call");
  assert.equal(parsed?.parts[1]?.name, "Read");
  assert.deepEqual(parsed?.parts[1]?.input, { path: "/tmp/x" });
});

test("parseCursorTranscriptLine reads user_query text", () => {
  const parsed = parseCursorTranscriptLine(
    JSON.stringify({
      role: "user",
      message: {
        content: [{ type: "text", text: "<user_query>ping</user_query>" }],
      },
    }),
  );
  assert.deepEqual(parsed, {
    role: "user",
    parts: [{ type: "text", text: "ping", markdown: false }],
  });
});

test("extractCursorContentParts skips empty tool-only? keeps tools", () => {
  const parts = extractCursorContentParts(
    [{ type: "tool_use", name: "Shell", input: { command: "ls" } }],
    "assistant",
  );
  assert.equal(parts.length, 1);
  assert.equal(parts[0]?.type, "tool-call");
});

test("mergeCursorMessageParts concatenates adjacent text", () => {
  const merged = mergeCursorMessageParts(
    [{ type: "text", text: "a", markdown: true }],
    [{ type: "text", text: "b", markdown: true }],
  );
  assert.deepEqual(merged, [
    { type: "text", text: "a\n\nb", markdown: true },
  ]);
});
