import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  extractRawFrontmatterFence,
  getDocumentEditorBody,
  parseMarkdownDocument,
  rejoinDocumentFrontmatter,
  serializeDocumentBody,
  serializeSpacesDocumentBody,
} from "./document-frontmatter.ts";

describe("document front matter round-trip", () => {
  it("preserves unknown keys verbatim via serializeDocumentBody", () => {
    const source = `---
title: Household
room: attic
material: granite
dateNoted: 2026-09-27
source: landlord email
---

## Shutoffs

- Fuse box
`;
    const editor = getDocumentEditorBody(source, "Household");
    const saved = serializeDocumentBody(editor, { sourceContent: source });
    assert.match(saved, /^---\n/);
    assert.match(saved, /room: attic/);
    assert.match(saved, /material: granite/);
    assert.match(saved, /dateNoted: 2026-09-27/);
    assert.match(saved, /source: landlord email/);
    assert.match(saved, /## Shutoffs/);
    const fence = extractRawFrontmatterFence(saved);
    assert.ok(fence);
    assert.equal(fence, extractRawFrontmatterFence(source));
  });

  it("parseMarkdownDocument keeps extras for unknown keys", () => {
    const { frontmatter, body } = parseMarkdownDocument(`---
title: Note
room: kitchen
material: steel
---

Body here
`);
    assert.equal(frontmatter.title, "Note");
    assert.deepEqual(frontmatter.extras, {
      room: "kitchen",
      material: "steel",
    });
    assert.match(body, /Body here/);
  });

  it("serializeSpacesDocumentBody keeps extras from sourceContent", () => {
    const source = `---
title: Old
status: concept
room: living
dateNoted: 2026-01-01
source: survey
---

old body
`;
    const next = serializeSpacesDocumentBody({
      body: "new body",
      title: "Updated",
      status: "published",
      slug: "updated",
      sourceContent: source,
    });
    assert.match(next, /title: Updated/);
    assert.match(next, /status: published/);
    assert.match(next, /slug: updated/);
    assert.match(next, /room: living/);
    assert.match(next, /dateNoted: 2026-01-01/);
    assert.match(next, /source: survey/);
    assert.match(next, /new body/);
  });

  it("rejoinDocumentFrontmatter is a no-op without a fence", () => {
    assert.equal(
      rejoinDocumentFrontmatter("# Title\n\nHi", "Hi"),
      "Hi",
    );
  });
});
