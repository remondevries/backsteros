import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consumeOpenHrefStamp,
  normalizeHref,
} from "./external-open-href";

test("normalizeHref picks the first absolute app path", () => {
  assert.equal(
    normalizeHref("1785338203314\n/tasks/abc\n"),
    "/tasks/abc",
  );
  assert.equal(normalizeHref("//evil"), null);
  assert.equal(normalizeHref("nope"), null);
});

test("consumeOpenHrefStamp seeds leftover without opening", () => {
  const seeded = consumeOpenHrefStamp(
    "1\n/tasks/old\n",
    { seeded: false, lastStamp: null },
  );
  assert.equal(seeded.href, null);
  assert.equal(seeded.seeded, true);
  assert.equal(seeded.lastStamp, "1\n/tasks/old");

  const same = consumeOpenHrefStamp("1\n/tasks/old\n", seeded);
  assert.equal(same.href, null);

  const fresh = consumeOpenHrefStamp("2\n/projects/x\n", seeded);
  assert.equal(fresh.href, "/projects/x");
  assert.equal(fresh.lastStamp, "2\n/projects/x");
});

test("consumeOpenHrefStamp opens after empty first seed", () => {
  const empty = consumeOpenHrefStamp("", {
    seeded: false,
    lastStamp: null,
  });
  assert.equal(empty.href, null);
  assert.equal(empty.seeded, true);

  const next = consumeOpenHrefStamp("9\n/inbox\n", empty);
  assert.equal(next.href, "/inbox");
});
