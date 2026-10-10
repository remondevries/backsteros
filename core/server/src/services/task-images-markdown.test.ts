import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { appendImageMarkdown, markdownImageSnippet } = await import(
  "./task-images.js"
);

describe("task image markdown helpers", () => {
  it("builds and appends image snippets", () => {
    assert.equal(
      markdownImageSnippet("/api/v1/tasks/t1/images/i1", "bug"),
      "![bug](/api/v1/tasks/t1/images/i1)",
    );
    assert.equal(
      appendImageMarkdown("Hello", [
        { url: "/api/v1/tasks/t1/images/i1", alt: "shot" },
      ]),
      "Hello\n\n![shot](/api/v1/tasks/t1/images/i1)",
    );
    assert.equal(
      appendImageMarkdown(null, [
        { url: "/api/v1/tasks/t1/images/i1" },
      ]),
      "![screenshot](/api/v1/tasks/t1/images/i1)",
    );
  });
});
