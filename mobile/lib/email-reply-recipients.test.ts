import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildReplyRecipients,
  normalizeEmailRecipients,
} from "./email-reply-recipients";

test("normalizeEmailRecipients keeps the full To list", () => {
  assert.deepEqual(
    normalizeEmailRecipients(["Ada <ada@example.com>", "bob@example.com"]),
    ["ada@example.com", "bob@example.com"],
  );
  assert.deepEqual(
    normalizeEmailRecipients("ada@example.com, bob@example.com"),
    ["ada@example.com", "bob@example.com"],
  );
});

test("buildReplyRecipients reply vs reply-all", () => {
  const message = {
    from: "Ada <ada@example.com>",
    to: ["Remon <remon@example.com>", "Bob <bob@example.com>"],
    cc: ["Cc <cc@example.com>"],
  };
  assert.deepEqual(
    buildReplyRecipients({
      message,
      inboxEmail: "remon@example.com",
      replyAll: false,
    }),
    { to: ["ada@example.com"], cc: [] },
  );
  assert.deepEqual(
    buildReplyRecipients({
      message,
      inboxEmail: "remon@example.com",
      replyAll: true,
    }),
    { to: ["ada@example.com"], cc: ["bob@example.com", "cc@example.com"] },
  );
});
