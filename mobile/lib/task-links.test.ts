import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  coerceSparkEmailUrl,
  isSparkEmailTaskLinkUrl,
  normalizeTaskLinkUrl,
  parseTaskLinks,
  taskLinkDisplayLabel,
} from "./task-links.ts";

describe("task-links", () => {
  it("coerces Spark deep links", () => {
    const spark =
      "readdle-spark://bl=QTplbWFpbEByZW1vbmRldnJpZXMuY29t";
    assert.equal(coerceSparkEmailUrl(spark), spark);
    assert.equal(
      coerceSparkEmailUrl(`https://${spark}`),
      spark,
    );
    assert.equal(isSparkEmailTaskLinkUrl(spark), true);
    assert.equal(taskLinkDisplayLabel(spark), "E-mail");
  });

  it("normalizes https URLs and rejects bare schemes", () => {
    assert.equal(
      normalizeTaskLinkUrl("example.com/path"),
      "https://example.com/path",
    );
    assert.equal(normalizeTaskLinkUrl("mailto:a@b.com"), null);
    assert.equal(normalizeTaskLinkUrl("/email/in/msg"), "/email/in/msg");
  });

  it("parses sqlite / API link payloads", () => {
    const links = [
      {
        id: "1",
        url: "readdle-spark://bl=abc",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    assert.deepEqual(parseTaskLinks(links), links);
    assert.deepEqual(parseTaskLinks(JSON.stringify(links)), links);
    assert.deepEqual(parseTaskLinks(null), []);
    assert.deepEqual(parseTaskLinks("[]"), []);
  });
});
