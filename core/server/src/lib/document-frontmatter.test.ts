import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  composeDocumentMarkdown,
  mergeFrontMatter,
  splitDocumentMarkdown,
} from "../lib/document-frontmatter.ts";

describe("document front matter (server yaml)", () => {
  it("round-trips core keys", () => {
    const source = composeDocumentMarkdown({
      frontMatter: {
        type: "reference",
        status: "draft",
        audience: "agents",
      },
      body: "# Hello\n",
    });
    const parsed = splitDocumentMarkdown(source);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.frontMatter.type, "reference");
    assert.match(parsed.body, /Hello/);
  });

  it("marks invalid yaml", () => {
    const parsed = splitDocumentMarkdown(`---
type: [broken
---
Body
`);
    assert.equal(parsed.valid, false);
  });

  it("removes patched keys with null and keeps the rest of the record", () => {
    const merged = mergeFrontMatter(
      { type: "reference", customNote: "keep me", status: "draft" },
      { status: null, audience: "agents" },
    );
    assert.equal(merged.status, undefined);
    assert.equal(merged.customNote, "keep me");
    assert.equal(merged.type, "reference");
    assert.equal(merged.audience, "agents");
  });
});
