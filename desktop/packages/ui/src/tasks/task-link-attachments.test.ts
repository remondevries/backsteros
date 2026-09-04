import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAppDocumentTaskLinkUrl,
  isAppEmailTaskLinkUrl,
  isAppLetterTaskLinkUrl,
  normalizeTaskLinkUrl,
  resolveTaskLinkAttachmentLabel,
  taskLinkDisplayLabel,
  type TaskLinkPickerOption,
} from "../components/tasks/task-link-attachments.tsx";

test("normalizeTaskLinkUrl accepts in-app email and knowledge paths", () => {
  assert.equal(
    normalizeTaskLinkUrl("/email/in_1/messages/msg_1"),
    "/email/in_1/messages/msg_1",
  );
  assert.equal(
    normalizeTaskLinkUrl("/knowledge/handbook"),
    "/knowledge/handbook",
  );
  assert.equal(normalizeTaskLinkUrl("/letters/l-12"), "/letters/l-12");
});

test("isAppEmailTaskLinkUrl, isAppDocumentTaskLinkUrl, isAppLetterTaskLinkUrl", () => {
  assert.equal(isAppEmailTaskLinkUrl("/email/in_1/messages/msg_1"), true);
  assert.equal(isAppEmailTaskLinkUrl("https://example.com"), false);
  assert.equal(isAppDocumentTaskLinkUrl("/knowledge/notes"), true);
  assert.equal(
    isAppDocumentTaskLinkUrl("/projects/p1/documents/doc_1"),
    true,
  );
  assert.equal(isAppLetterTaskLinkUrl("/letters/l-12"), true);
  assert.equal(isAppLetterTaskLinkUrl("/projects/acme/letters/l-3"), true);
  assert.equal(isAppLetterTaskLinkUrl("/letters/new"), false);
  assert.equal(isAppLetterTaskLinkUrl("/knowledge/handbook"), false);
});

test("taskLinkDisplayLabel for app email, document, and letter links", () => {
  assert.equal(taskLinkDisplayLabel("/email/in_1/messages/msg_1"), "E-mail");
  assert.equal(taskLinkDisplayLabel("/knowledge/handbook"), "handbook");
  assert.equal(taskLinkDisplayLabel("/letters/l-12"), "L-12");
});

test("resolveTaskLinkAttachmentLabel formats ID - Title", () => {
  const options: TaskLinkPickerOption[] = [
    {
      id: "letter-1",
      label: "Q1 invoice follow-up",
      href: "/letters/l-12",
      detail: "L-12",
      kindLabel: "Letter",
      scopeLabel: "BacksterOS (Desktop)",
    },
    {
      id: "doc-1",
      label: "Shipping checklist",
      href: "/knowledge/ops/shipping-checklist",
      detail: "ops/shipping-checklist",
      kindLabel: "Document",
      scopeLabel: "Knowledge Base",
    },
  ];

  assert.equal(
    resolveTaskLinkAttachmentLabel("/letters/l-12", options),
    "L-12 - Q1 invoice follow-up",
  );
  assert.equal(
    resolveTaskLinkAttachmentLabel("/knowledge/ops/shipping-checklist", options),
    "Shipping checklist",
  );
  assert.equal(
    resolveTaskLinkAttachmentLabel("/letters/l-99", options),
    "L-99",
  );
});
