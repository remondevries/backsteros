import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanSetAgentWorking,
  resolveAgentWorkingFields,
} from "./agent-working.js";

test("resolveAgentWorkingFields sets contact + startedAt as working", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const next = resolveAgentWorkingFields({
    existing: { contactId: null, startedAt: null, label: null, kind: null },
    agentWorkingContactId: "ralph",
    agentWorkingLabel: "Ralph · BF-37",
    nextStatus: "in_progress",
    now,
  });
  assert.equal(next.contactId, "ralph");
  assert.equal(next.startedAt?.toISOString(), now.toISOString());
  assert.equal(next.label, "Ralph · BF-37");
  assert.equal(next.kind, "working");
});

test("resolveAgentWorkingFields keeps startedAt when same contact re-asserts", () => {
  const started = new Date("2026-10-07T11:00:00.000Z");
  const next = resolveAgentWorkingFields({
    existing: {
      contactId: "ralph",
      startedAt: started,
      label: "old",
      kind: "working",
    },
    agentWorkingContactId: "ralph",
    agentWorkingLabel: "new",
    nextStatus: "in_progress",
    now: new Date("2026-10-07T12:00:00.000Z"),
  });
  assert.equal(next.contactId, "ralph");
  assert.equal(next.startedAt?.toISOString(), started.toISOString());
  assert.equal(next.label, "new");
  assert.equal(next.kind, "working");
});

test("resolveAgentWorkingFields clears working on in_review", () => {
  const next = resolveAgentWorkingFields({
    existing: {
      contactId: "ralph",
      startedAt: new Date(),
      label: "x",
      kind: "working",
    },
    nextStatus: "in_review",
  });
  assert.deepEqual(next, {
    contactId: null,
    startedAt: null,
    label: null,
    kind: null,
  });
});

test("resolveAgentWorkingFields keeps reviewing on in_review", () => {
  const started = new Date("2026-10-07T11:00:00.000Z");
  const next = resolveAgentWorkingFields({
    existing: {
      contactId: "sander",
      startedAt: started,
      label: null,
      kind: "reviewing",
    },
    nextStatus: "in_review",
  });
  assert.equal(next.contactId, "sander");
  assert.equal(next.kind, "reviewing");
  assert.equal(next.startedAt?.toISOString(), started.toISOString());
});

test("resolveAgentWorkingFields sets reviewing while in_review", () => {
  const now = new Date("2026-10-07T12:00:00.000Z");
  const next = resolveAgentWorkingFields({
    existing: { contactId: null, startedAt: null, label: null, kind: null },
    agentWorkingContactId: "sander",
    agentWorkingKind: "reviewing",
    nextStatus: "in_review",
    now,
  });
  assert.equal(next.contactId, "sander");
  assert.equal(next.kind, "reviewing");
  assert.equal(next.startedAt?.toISOString(), now.toISOString());
});

test("resolveAgentWorkingFields defaults kind to reviewing when status is in_review", () => {
  const next = resolveAgentWorkingFields({
    existing: { contactId: null, startedAt: null, label: null, kind: null },
    agentWorkingContactId: "sander",
    nextStatus: "in_review",
    now: new Date("2026-10-07T12:00:00.000Z"),
  });
  assert.equal(next.kind, "reviewing");
});

test("resolveAgentWorkingFields clears reviewing when leaving in_review", () => {
  const next = resolveAgentWorkingFields({
    existing: {
      contactId: "sander",
      startedAt: new Date(),
      label: null,
      kind: "reviewing",
    },
    nextStatus: "in_progress",
  });
  assert.deepEqual(next, {
    contactId: null,
    startedAt: null,
    label: null,
    kind: null,
  });
});

test("resolveAgentWorkingFields clears reviewing on completed", () => {
  const next = resolveAgentWorkingFields({
    existing: {
      contactId: "sander",
      startedAt: new Date(),
      label: null,
      kind: "reviewing",
    },
    nextStatus: "completed",
  });
  assert.deepEqual(next, {
    contactId: null,
    startedAt: null,
    label: null,
    kind: null,
  });
});

test("resolveAgentWorkingFields clears when contact set to null", () => {
  const next = resolveAgentWorkingFields({
    existing: {
      contactId: "ralph",
      startedAt: new Date(),
      label: "x",
      kind: "working",
    },
    agentWorkingContactId: null,
    nextStatus: "in_progress",
  });
  assert.deepEqual(next, {
    contactId: null,
    startedAt: null,
    label: null,
    kind: null,
  });
});

test("assertCanSetAgentWorking allows agent to claim self", () => {
  assert.doesNotThrow(() =>
    assertCanSetAgentWorking({
      canSetAny: false,
      authContactId: "ralph",
      existingContactId: null,
      nextContactId: "ralph",
      touchesLabel: false,
      touchesKind: false,
    }),
  );
});

test("assertCanSetAgentWorking forbids agent claiming another contact", () => {
  assert.throws(
    () =>
      assertCanSetAgentWorking({
        canSetAny: false,
        authContactId: "ralph",
        existingContactId: null,
        nextContactId: "sander",
        touchesLabel: false,
        touchesKind: false,
      }),
    (error: unknown) =>
      error instanceof Error && error.message === "AGENT_WORKING_FORBIDDEN",
  );
});

test("assertCanSetAgentWorking forbids clearing another agent marker", () => {
  assert.throws(
    () =>
      assertCanSetAgentWorking({
        canSetAny: false,
        authContactId: "ralph",
        existingContactId: "sander",
        nextContactId: null,
        touchesLabel: false,
        touchesKind: false,
      }),
    (error: unknown) =>
      error instanceof Error && error.message === "AGENT_WORKING_FORBIDDEN",
  );
});

test("assertCanSetAgentWorking allows owner to set any contact", () => {
  assert.doesNotThrow(() =>
    assertCanSetAgentWorking({
      canSetAny: true,
      authContactId: null,
      existingContactId: "ralph",
      nextContactId: "sander",
      touchesLabel: false,
      touchesKind: true,
    }),
  );
});
