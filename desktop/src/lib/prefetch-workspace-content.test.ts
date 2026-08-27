import assert from "node:assert/strict";
import { test } from "node:test";

import {
  firstKnowledgeDocumentIdForWarm,
  firstLetterIdForWarm,
} from "./warm-workspace-detail-ids.ts";

test("first knowledge warm id skips folders", () => {
  assert.equal(
    firstKnowledgeDocumentIdForWarm([
      { id: "folder-1", kind: "folder" },
      { id: "doc-1", kind: "document" },
      { id: "doc-2", kind: "document" },
    ]),
    "doc-1",
  );
  assert.equal(firstKnowledgeDocumentIdForWarm([]), null);
});

test("first letter warm id is the list head", () => {
  assert.equal(
    firstLetterIdForWarm([{ id: "letter-1" }, { id: "letter-2" }]),
    "letter-1",
  );
  assert.equal(firstLetterIdForWarm([]), null);
});
