import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentMailMessageDetail } from "@backsteros/contracts";

import {
  resolveEmailThreadPropertiesFromDetail,
  resolveEmailThreadPropertiesFromListItem,
} from "./email-thread-properties";

test("resolveEmailThreadPropertiesFromDetail prefers threadMetadata", () => {
  const detail = {
    messageId: "msg-1",
    inboxId: "inbox-1",
    subject: "Hello",
    from: "sender@example.com",
    timestamp: "2026-01-01T00:00:00.000Z",
    status: "triage",
    priority: 0,
    threadMetadata: {
      id: "thread-1",
      inboxId: "inbox-1",
      threadKey: "thread-key",
      number: 4,
      displayId: "E-4",
      organizationId: "org-1",
      organizationName: "Acme",
      contactId: "contact-1",
      contactName: "Remon",
      assigneeId: "assignee-1",
      assigneeName: "Agent",
      projectId: "project-1",
      projectName: "BacksterOS",
      projectKey: "BSH",
      status: "in_progress",
      priority: 2,
      dueDate: "2026-01-02T12:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  } as AgentMailMessageDetail;

  const props = resolveEmailThreadPropertiesFromDetail(detail);
  assert.equal(props.status, "in_progress");
  assert.equal(props.priority, 2);
  assert.equal(props.organizationId, "org-1");
  assert.equal(props.organizationName, "Acme");
  assert.equal(props.contactId, "contact-1");
  assert.equal(props.displayId, "E-4");
});

test("resolveEmailThreadPropertiesFromListItem uses list enrichment", () => {
  const props = resolveEmailThreadPropertiesFromListItem({
    kind: "message",
    id: "msg-1",
    inboxId: "inbox-1",
    subject: "Hello",
    from: "sender@example.com",
    receivedAt: 0,
    status: "ready_to_start",
    priority: 1,
    projectId: "project-1",
    projectName: "BacksterOS",
    projectKey: "BSH",
    displayId: "E-9",
  });
  assert.equal(props.status, "ready_to_start");
  assert.equal(props.projectKey, "BSH");
  assert.equal(props.displayId, "E-9");
});
