import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeNamedLinkUrl,
  parseNamedLinkToken,
} from "./named-link-tokens.js";
import { segmentMarkdownWithMentions } from "./mention-tokens.js";

describe("parseNamedLinkToken", () => {
  it("parses Spark email links with a display label", () => {
    const raw =
      "[readdle-spark://bl=QTplbWFpbEByZW1vbmRldnJpZXMuY29tO0lEOnlhMXZJeVJlUkV5bS1vTHhrYjBL%0D%0AS3dAZ2VvcG9kLWlzbXRwZC00O2dJRDoxODc0NTk4OTQ2NTA0ODUxNDI4OzMxOTI4%0D%0ANjgyNjI%3D|Figma]";
    const token = parseNamedLinkToken(raw);
    assert.ok(token);
    assert.equal(token.kind, "spark-email");
    assert.equal(token.label, "Figma");
    assert.ok(token.url.startsWith("readdle-spark://"));
  });

  it("parses https URLs with a display label", () => {
    const token = parseNamedLinkToken("[https://figma.com/file/abc|Design]");
    assert.ok(token);
    assert.equal(token.kind, "url");
    assert.equal(token.label, "Design");
    assert.equal(token.url, "https://figma.com/file/abc");
  });

  it("rejects @ mentions and non-URL wiki brackets", () => {
    assert.equal(parseNamedLinkToken("[@task:BSH-1]"), null);
    assert.equal(parseNamedLinkToken("[Page Name|Alias]"), null);
    assert.equal(parseNamedLinkToken("[ ]"), null);
  });

  it("normalizes https-wrapped Spark URLs", () => {
    assert.equal(
      normalizeNamedLinkUrl("https://readdle-spark://bl=abc"),
      "readdle-spark://bl=abc",
    );
  });
});

describe("segmentMarkdownWithMentions + named links", () => {
  it("segments named links alongside @ mentions", () => {
    const segments = segmentMarkdownWithMentions(
      "See [https://example.com|Example] and [@task:BSH-1]",
    );
    assert.equal(segments.length, 4);
    assert.equal(segments[0]?.type, "markdown");
    assert.equal(segments[1]?.type, "namedLink");
    if (segments[1]?.type === "namedLink") {
      assert.equal(segments[1].token.label, "Example");
    }
    assert.equal(segments[2]?.type, "markdown");
    assert.equal(segments[3]?.type, "mention");
  });
});
