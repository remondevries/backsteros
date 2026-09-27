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

  it("does not treat # lines inside fenced code blocks as headings", () => {
    const withFence = `---
type: runbook
---

# Setup
Intro.

\`\`\`bash
# comment inside fence
echo hi
\`\`\`

## Steps
Do the thing.

~~~
# also not a heading
~~~
`;
    const sections = parseDocumentSections(withFence);
    assert.deepEqual(
      sections.map((s) => s.heading),
      ["Setup", "Steps"],
    );
    assert.equal(
      sections.find((s) => s.slug === "comment-inside-fence"),
      undefined,
    );
    const setup = readDocumentSection(withFence, "setup");
    assert.match(setup.text, /# comment inside fence/);
  });

  it("parses CRLF headings and preserves bytes on replace", () => {
    const crlf = [
      "---",
      "type: runbook",
      "---",
      "",
      "# Setup",
      "Alpha.",
      "",
      "## Details",
      "Beta.",
      "",
      "# Closing",
      "Gamma.",
      "",
    ].join("\r\n");

    const sections = parseDocumentSections(crlf);
    assert.deepEqual(
      sections.map((s) => s.heading),
      ["Setup", "Details", "Closing"],
    );

    const { content } = replaceDocumentSectionBody(
      crlf,
      "details",
      "Replaced.\r\n",
    );
    const detailsHeading = content.indexOf("## Details");
    assert.ok(detailsHeading > 0);
    assert.equal(
      content.slice(0, detailsHeading + "## Details".length),
      crlf.slice(0, crlf.indexOf("## Details") + "## Details".length),
    );
    assert.match(content, /## Details\r\nReplaced\.\r\n/);
    assert.match(content, /# Closing\r\nGamma\./);
    // Bytes before the replaced body (through Details heading line) unchanged.
    const bodyStart = findDocumentSection(crlf, "details").bodyStart;
    assert.equal(content.slice(0, bodyStart), crlf.slice(0, bodyStart));
  });
});
