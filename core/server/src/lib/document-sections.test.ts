import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DocumentSectionError,
  findDocumentSection,
  parseDocumentSections,
  readDocumentSection,
  replaceDocumentSectionBody,
  slugifyHeading,
} from "./document-sections.ts";

const SAMPLE = `---
audience: agents
status: current
type: house-rule
---

# Overview
Alpha line.

## Details
Beta line.

# Overview
Duplicate title body.

# Closing
Gamma.
`;

describe("document sections", () => {
  it("slugifies headings", () => {
    assert.equal(slugifyHeading("House Rules!"), "house-rules");
  });

  it("parses ATX sections with paths", () => {
    const sections = parseDocumentSections(SAMPLE);
    assert.equal(sections.length, 4);
    assert.deepEqual(sections[0]!.path, ["Overview"]);
    assert.deepEqual(sections[1]!.path, ["Overview", "Details"]);
    assert.equal(sections[1]!.slug, "details");
  });

  it("reads a unique section by slug and path", () => {
    const bySlug = readDocumentSection(SAMPLE, "details");
    assert.match(bySlug.text, /^## Details\nBeta line\.\n/);
    assert.ok(!bySlug.text.includes("Alpha"));

    const byPath = readDocumentSection(SAMPLE, "Overview/Details");
    assert.equal(byPath.section.heading, "Details");
  });

  it("404s unknown headings and 409s ambiguous ones", () => {
    assert.throws(
      () => findDocumentSection(SAMPLE, "missing"),
      (error: unknown) =>
        error instanceof DocumentSectionError &&
        error.code === "SECTION_NOT_FOUND",
    );
    assert.throws(
      () => findDocumentSection(SAMPLE, "overview"),
      (error: unknown) =>
        error instanceof DocumentSectionError &&
        error.code === "SECTION_AMBIGUOUS",
    );
  });

  it("replaces only the section body and preserves other bytes", () => {
    const { content } = replaceDocumentSectionBody(
      SAMPLE,
      "details",
      "Replaced beta.\n",
    );
    assert.ok(content.startsWith("---\naudience: agents\n"));
    assert.equal(
      content.slice(0, content.indexOf("# Overview")),
      SAMPLE.slice(0, SAMPLE.indexOf("# Overview")),
    );
    assert.match(content, /## Details\nReplaced beta\.\n/);
    assert.match(content, /Alpha line\./);
    assert.match(content, /Duplicate title body\./);
    assert.match(content, /# Closing\nGamma\./);

    // Front matter + first overview heading line unchanged byte-for-byte.
    const fmEnd = SAMPLE.indexOf("# Overview");
    assert.equal(content.slice(0, fmEnd), SAMPLE.slice(0, fmEnd));
  });
});
