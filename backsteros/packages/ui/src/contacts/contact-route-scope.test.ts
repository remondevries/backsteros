import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getScopedContactEmailHref,
  isContactScopedEntityDetailPath,
  parseContactScopedEntityDetail,
} from "./contact-route-scope.js";

test("isContactScopedEntityDetailPath matches nested entity details only", () => {
  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1/tasks/t-1"), true);
  assert.equal(
    isContactScopedEntityDetailPath("/contacts/c-1/letters/l-1"),
    true,
  );
  assert.equal(
    isContactScopedEntityDetailPath("/contacts/c-1/meetings/m-1"),
    true,
  );
  assert.equal(
    isContactScopedEntityDetailPath("/contacts/c-1/emails/box/msg"),
    true,
  );
  assert.equal(
    isContactScopedEntityDetailPath("/contacts/c-1/emails/box/drafts/d1"),
    true,
  );
  assert.equal(
    isContactScopedEntityDetailPath(
      "/organizations/acme/contacts/c-1/meetings/m-1",
    ),
    true,
  );

  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1"), false);
  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1/tasks"), false);
  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1/meetings"), false);
  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1/letters"), false);
  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1/emails"), false);
  assert.equal(isContactScopedEntityDetailPath("/contacts/c-1/details"), false);
  assert.equal(isContactScopedEntityDetailPath("/calendar/meetings/m-1"), false);
  assert.equal(isContactScopedEntityDetailPath("/tasks/t-1"), false);
});

test("parseContactScopedEntityDetail returns kind + ids", () => {
  assert.deepEqual(parseContactScopedEntityDetail("/contacts/c-1/meetings/m-9"), {
    kind: "meetings",
    id: "m-9",
  });
  assert.deepEqual(
    parseContactScopedEntityDetail("/contacts/c-1/emails/in%2Fbox/msg-1"),
    { kind: "emails", inboxId: "in/box", messageId: "msg-1" },
  );
  assert.deepEqual(
    parseContactScopedEntityDetail("/contacts/c-1/emails/box/drafts/d-1"),
    { kind: "emails", inboxId: "box", draftId: "d-1" },
  );
  assert.equal(
    getScopedContactEmailHref("c-1", {
      kind: "draft",
      inboxId: "box",
      id: "d-1",
    }),
    "/contacts/c-1/emails/box/drafts/d-1",
  );
});
