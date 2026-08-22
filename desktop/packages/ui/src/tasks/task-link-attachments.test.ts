import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAppDocumentTaskLinkUrl,
  isAppEmailTaskLinkUrl,
  normalizeTaskLinkUrl,
  taskLinkDisplayLabel,
} from "../components/task-link-attachments.tsx";

test("normalizeTaskLinkUrl accepts in-app email and knowledge paths", () => {
  assert.equal(
    normalizeTaskLinkUrl("/email/in_1/messages/msg_1"),
    "/email/in_1/messages/msg_1",
  );
  assert.equal(
    normalizeTaskLinkUrl("/knowledge/handbook"),
    "/knowledge/handbook",
  );
});

test("isAppEmailTaskLinkUrl and isAppDocumentTaskLinkUrl", () => {
  assert.equal(isAppEmailTaskLinkUrl("/email/in_1/messages/msg_1"), true);
  assert.equal(isAppEmailTaskLinkUrl("https://example.com"), false);
  assert.equal(isAppDocumentTaskLinkUrl("/knowledge/notes"), true);
  assert.equal(
    isAppDocumentTaskLinkUrl("/projects/p1/documents/doc_1"),
    true,
  );
});

test("taskLinkDisplayLabel for app email and document links", () => {
  assert.equal(taskLinkDisplayLabel("/email/in_1/messages/msg_1"), "E-mail");
  assert.equal(taskLinkDisplayLabel("/knowledge/handbook"), "handbook");
});
