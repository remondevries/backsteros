import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAppDocumentTaskLinkUrl,
  isAppEmailTaskLinkUrl,
  isAppLetterTaskLinkUrl,
  isPenpotDesignTaskLinkUrl,
  normalizeTaskLinkUrl,
  resolveTaskLinkAttachmentLabel,
  resolveTaskLinkOpenHref,
  taskLinkDisplayLabel,
  type TaskLinkPickerOption,
} from "../components/tasks/task-link-attachments.tsx";

test("normalizeTaskLinkUrl accepts in-app email and knowledge paths", () => {
  assert.equal(
    normalizeTaskLinkUrl("/email/in_1/messages/msg_1"),
    "/email/in_1/messages/msg_1",
  );
  assert.equal(
    normalizeTaskLinkUrl("/spaces/handbook"),
    "/spaces/handbook",
  );
  assert.equal(normalizeTaskLinkUrl("/letters/l-12"), "/letters/l-12");
});

test("normalizeTaskLinkUrl coerces Penpot workspace URLs to backsterdesign://", () => {
  const file = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const page = "11111111-2222-3333-4444-555555555555";
  const board = "99999999-8888-7777-6666-555555555555";
  const raw = `https://localhost:3449/#/workspace?file-id=${file}&page-id=${page}`;
  const normalized = normalizeTaskLinkUrl(raw);
  assert.ok(normalized);
  assert.equal(isPenpotDesignTaskLinkUrl(normalized!), true);
  assert.match(normalized!, /^backsterdesign:\/\/workspace\?/);
  assert.equal(taskLinkDisplayLabel(normalized!), "File");
  assert.match(
    resolveTaskLinkOpenHref(normalized!),
    new RegExp(`file-id=${file}`),
  );

  const withBoard = normalizeTaskLinkUrl(
    `${raw}&board-id=${board}`,
  );
  assert.ok(withBoard);
  assert.equal(taskLinkDisplayLabel(withBoard!), "Item");
});

test("isAppEmailTaskLinkUrl, isAppDocumentTaskLinkUrl, isAppLetterTaskLinkUrl", () => {
  assert.equal(isAppEmailTaskLinkUrl("/email/in_1/messages/msg_1"), true);
  assert.equal(isAppEmailTaskLinkUrl("https://example.com"), false);
  assert.equal(isAppDocumentTaskLinkUrl("/spaces/notes"), true);
  assert.equal(
    isAppDocumentTaskLinkUrl("/projects/p1/documents/doc_1"),
    true,
  );
  assert.equal(isAppLetterTaskLinkUrl("/letters/l-12"), true);
  assert.equal(isAppLetterTaskLinkUrl("/projects/acme/letters/l-3"), true);
  assert.equal(isAppLetterTaskLinkUrl("/letters/new"), false);
  assert.equal(isAppLetterTaskLinkUrl("/spaces/handbook"), false);
});

test("taskLinkDisplayLabel for app email, document, and letter links", () => {
  assert.equal(taskLinkDisplayLabel("/email/in_1/messages/msg_1"), "E-mail");
  assert.equal(taskLinkDisplayLabel("/spaces/handbook"), "handbook");
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
      href: "/spaces/ops/shipping-checklist",
      detail: "ops/shipping-checklist",
      kindLabel: "Document",
      scopeLabel: "Spaces",
    },
  ];

  assert.equal(
    resolveTaskLinkAttachmentLabel("/letters/l-12", options),
    "L-12 - Q1 invoice follow-up",
  );
  assert.equal(
    resolveTaskLinkAttachmentLabel("/spaces/ops/shipping-checklist", options),
    "Shipping checklist",
  );
  assert.equal(
    resolveTaskLinkAttachmentLabel("/letters/l-99", options),
    "L-99",
  );
});
