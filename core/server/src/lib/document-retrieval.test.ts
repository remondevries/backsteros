import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOCUMENT_RETRIEVAL_HARD_MAX_BUDGET,
  clampRetrievalBudget,
  loadRetrievalCandidateBodies,
  mapWithConcurrency,
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

  it("mapWithConcurrency bounds in-flight work and preserves order", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];

    const results = await mapWithConcurrency(
      [10, 20, 30, 40, 50, 60],
      2,
      async (value, index) => {
        started.push(index);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return value * 2;
      },
    );

    assert.deepEqual(results, [20, 40, 60, 80, 100, 120]);
    assert.ok(maxInFlight <= 2);
    assert.ok(maxInFlight >= 2);
    assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
  });

  it("loadRetrievalCandidateBodies skips missing objects and counts them", async () => {
    const skippedIds: string[] = [];
    const { candidates, skipped } = await loadRetrievalCandidateBodies(
      [
        {
          id: "ok-1",
          docKey: "DOC-1",
          title: "Present",
          storageKey: "vault/ok-1.md",
        },
        {
          id: "missing",
          docKey: null,
          title: "Gone",
          storageKey: "vault/missing.md",
        },
        {
          id: "ok-2",
          docKey: "DOC-2",
          title: "Also present",
          storageKey: "vault/ok-2.md",
        },
      ],
      {
        concurrency: 2,
        getObject: async (storageKey) => {
          if (storageKey.includes("missing")) {
            throw new Error("not found");
          }
          return { body: `# Body for ${storageKey}\nbackster term here.\n` };
        },
        onSkip: (row) => {
          skippedIds.push(row.id);
        },
      },
    );

    assert.equal(skipped, 1);
    assert.deepEqual(skippedIds, ["missing"]);
    assert.equal(candidates.length, 2);
    assert.deepEqual(
      candidates.map((c) => c.id),
      ["ok-1", "ok-2"],
    );

    const { results } = retrieveDocumentSections({
      query: "backster",
      candidates,
    });
    assert.ok(results.some((hit) => hit.documentId === "ok-1"));
    assert.ok(results.some((hit) => hit.documentId === "ok-2"));
    assert.ok(!results.some((hit) => hit.documentId === "missing"));
  });

  it("ranks an older matching candidate above newer unrelated ones", () => {
    // Mirrors the SQL pre-filter regression: once metadata selects the right
    // rows (including docs older than the newest 100), section ranking must
    // still surface the match even when newer noise is also loaded.
    const { results } = retrieveDocumentSections({
      query: "backster",
      candidates: [
        {
          id: "new-noise-1",
          docKey: null,
          title: "Recent note",
          content: "# Hello\nNothing relevant.\n",
        },
        {
          id: "old-match",
          docKey: "DOC-OLD",
          title: "Backster playbook",
          content: `# Intro\nBackster retrieval should find this old doc.\n`,
        },
        {
          id: "new-noise-2",
          docKey: null,
          title: "Another recent",
          content: "# Other\nStill unrelated.\n",
        },
      ],
    });

    assert.ok(results.length >= 1);
    assert.equal(results[0]!.documentId, "old-match");
    assert.ok(!results.some((hit) => hit.documentId.startsWith("new-noise")));
  });
});
