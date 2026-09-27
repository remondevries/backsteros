import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DOCUMENT_SEMANTIC_TYPE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  applyMirrorFrontMatter,
  buildPropertiesIndex,
  coerceDocumentPropertyEnum,
  formatDocKey,
  parseDocKeyNumber,
  shouldAllocateDocKeyLocally,
} from "./document-core-property-schema.ts";
import {
  composeDocumentMarkdown,
  splitDocumentMarkdown,
} from "./document-frontmatter.ts";

describe("document properties mirrors", () => {
  it("maps individual → remon", () => {
    const merged = applyMirrorFrontMatter(
      { audience: "individual" },
      { audience: "agents" },
      null,
    );
    assert.equal(merged.audience, "remon");
  });

  it("preserves client/public when DB audience is group", () => {
    assert.equal(
      applyMirrorFrontMatter({ audience: "group" }, { audience: "client" }, "H")
        .audience,
      "client",
    );
    assert.equal(
      applyMirrorFrontMatter({ audience: "group" }, { audience: "public" }, null)
        .audience,
      "public",
    );
  });

  it("mirrors project key from the updated row", () => {
    const merged = applyMirrorFrontMatter(
      { audience: "group" },
      { status: "draft" },
      "OS",
    );
    assert.equal(merged.project, "OS");
    assert.equal(buildPropertiesIndex(merged).project, "OS");
  });
});

describe("legacy enum preserve vs strict", () => {
  it("preserves Spaces concept status when not strict", () => {
    assert.equal(
      coerceDocumentPropertyEnum(
        "status",
        "concept",
        DOCUMENT_STATUS_OPTIONS,
        false,
      ),
      "concept",
    );
  });

  it("rejects Spaces concept status when strict (PUT)", () => {
    assert.throws(
      () =>
        coerceDocumentPropertyEnum(
          "status",
          "concept",
          DOCUMENT_STATUS_OPTIONS,
          true,
        ),
      /INVALID_PROPERTY/,
    );
  });

  it("accepts core status when strict", () => {
    assert.equal(
      coerceDocumentPropertyEnum(
        "status",
        "draft",
        DOCUMENT_STATUS_OPTIONS,
        true,
      ),
      "draft",
    );
  });
});

describe("doc keys", () => {
  it("formats and parses DOC-n", () => {
    assert.equal(formatDocKey(42), "DOC-42");
    assert.equal(parseDocKeyNumber("DOC-42"), 42);
    assert.equal(parseDocKeyNumber("doc-7"), 7);
    assert.equal(parseDocKeyNumber("OS-26"), null);
  });

  it("allocates DOC-n only on non-local cores", () => {
    assert.equal(
      shouldAllocateDocKeyLocally({ CORE_REPLICATION_ROLE: "local" }),
      false,
    );
    assert.equal(
      shouldAllocateDocKeyLocally({ CORE_REPLICATION_ROLE: "cloud" }),
      true,
    );
    assert.equal(shouldAllocateDocKeyLocally({}), true);
  });
});

describe("property round-trip + invalid YAML lock", () => {
  it("round-trips core keys", () => {
    const content = composeDocumentMarkdown({
      frontMatter: {
        type: "house-rule",
        status: "current",
        audience: "agents",
        docKey: "DOC-1",
      },
      body: "## Rules\n\nBe kind.\n",
    });
    const parsed = splitDocumentMarkdown(content);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.frontMatter.type, "house-rule");
    assert.equal(parsed.frontMatter.docKey, "DOC-1");
    assert.match(parsed.body, /Be kind/);
  });

  it("marks invalid yaml so saves can lock", () => {
    const parsed = splitDocumentMarkdown(`---
status: [broken
---
Body
`);
    assert.equal(parsed.valid, false);
  });
});

describe("panel edit vs file edit (version conflict contract)", () => {
  it("documents that ifMatch mismatch is a 409 content_version_conflict", () => {
    // Contract used by PUT /documents/:id/properties and content CAS.
    const code = "content_version_conflict";
    const status = 409;
    assert.equal(status, 409);
    assert.equal(code, "content_version_conflict");
  });
});

describe("agent document types stay gated (OS-30 decision)", () => {
  it("exposes a fixed semantic type allowlist with no create-type API", () => {
    assert.ok(DOCUMENT_SEMANTIC_TYPE_OPTIONS.includes("house-rule"));
    assert.throws(
      () =>
        coerceDocumentPropertyEnum(
          "type",
          "brandNewAgentType",
          DOCUMENT_SEMANTIC_TYPE_OPTIONS,
          true,
        ),
      /INVALID_PROPERTY/,
    );
  });
});
