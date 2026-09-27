import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOCUMENT_RETRIEVAL_HARD_MAX_BUDGET,
  clampRetrievalBudget,
  retrieveDocumentSections,
} from "./document-retrieval.ts";

describe("document retrieval v1", () => {
  it("clamps budget to the hard max", () => {
    assert.equal(clampRetrievalBudget(undefined), 8000);
    assert.equal(clampRetrievalBudget(99_999), DOCUMENT_RETRIEVAL_HARD_MAX_BUDGET);
  });

  it("ranks sections by term matches and respects filters via candidates", () => {
    const { results } = retrieveDocumentSections({
      query: "vault backup",
      candidates: [
        {
          id: "a",
          docKey: "DOC-1",
          title: "House rules",
          content: `---
type: house-rule
---

# Rules
Always lock the vault.

# Backup
Vault backup runs nightly.
`,
        },
        {
          id: "b",
          docKey: "DOC-2",
          title: "Unrelated",
          content: `# Other
Nothing about storage.
`,
        },
      ],
    });

    assert.ok(results.length >= 1);
    assert.equal(results[0]!.documentId, "a");
    assert.match(results[0]!.heading, /Backup/i);
    assert.ok(results[0]!.score > 0);
    assert.ok(!results.some((hit) => hit.documentId === "b"));
  });

  it("never exceeds the character budget", () => {
    const longBody = `${"vault ".repeat(2000)}\n`;
    const { results, budget, truncated } = retrieveDocumentSections({
      query: "vault",
      budget: 100,
      candidates: [
        {
          id: "a",
          docKey: null,
          title: "Long",
          content: `# One\n${longBody}\n# Two\n${longBody}`,
        },
      ],
    });

    assert.equal(budget, 100);
    assert.equal(truncated, true);
    const total = results.reduce((sum, hit) => sum + hit.text.length, 0);
    assert.ok(total <= 100);
    assert.ok(results.length >= 1);
  });
});
