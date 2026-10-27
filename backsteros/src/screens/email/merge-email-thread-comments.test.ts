import assert from "node:assert/strict";
import { test } from "node:test";
import type { EmailThreadComment } from "@backsteros/contracts";

import { mergeEmailThreadComments } from "./merge-email-thread-comments.ts";

function comment(
  id: string,
  body = "note",
): EmailThreadComment {
  return {
    id,
    body,
    author: "agent",
    createdAt: "2026-10-26T12:00:00.000Z",
  };
}

test("mergeEmailThreadComments keeps local-only comments ahead of server", () => {
  const local = [comment("new"), comment("a")];
  const server = [comment("a"), comment("b")];
  assert.deepEqual(
    mergeEmailThreadComments({ local, server }).map((entry) => entry.id),
    ["new", "a", "b"],
  );
});

test("mergeEmailThreadComments prefers server when local is a subset", () => {
  const server = [comment("a", "updated"), comment("b")];
  const local = [comment("a", "stale")];
  const merged = mergeEmailThreadComments({ local, server });
  assert.deepEqual(
    merged.map((entry) => entry.id),
    ["a", "b"],
  );
  assert.equal(merged[0]?.body, "updated");
});

test("mergeEmailThreadComments reuses local array when id sequence matches", () => {
  const local = [comment("a"), comment("b")];
  const server = [comment("a"), comment("b")];
  assert.equal(mergeEmailThreadComments({ local, server }), local);
});

test("mergeEmailThreadComments drops excluded (locally deleted) ids", () => {
  const local = [comment("gone"), comment("a")];
  const server = [comment("gone"), comment("a"), comment("b")];
  assert.deepEqual(
    mergeEmailThreadComments({
      local,
      server,
      excludeIds: ["gone"],
    }).map((entry) => entry.id),
    ["a", "b"],
  );
});
