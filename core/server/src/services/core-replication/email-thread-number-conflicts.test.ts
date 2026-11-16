import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_THREAD_NUMBER_UNIQUE_CONSTRAINT,
  emailThreadNumberKeeper,
  isEmailThreadNumberUniqueViolation,
} from "./email-thread-number-conflicts.js";
import { REPLICATED_UNIQUE_FORKS } from "./natural-key-conflicts.js";

describe("email thread number forks", () => {
  const early = { id: "z-early", createdAt: new Date("2026-11-01T10:00:00Z") };
  const late = { id: "a-late", createdAt: new Date("2026-11-01T11:00:00Z") };

  it("earlier-created thread keeps the number, symmetric on both cores", () => {
    assert.equal(emailThreadNumberKeeper(early, late), early);
    assert.equal(emailThreadNumberKeeper(late, early), early);
  });

  it("tie on created_at keeps the smaller id", () => {
    const a = { id: "a", createdAt: early.createdAt };
    const b = { id: "b", createdAt: early.createdAt };
    assert.equal(emailThreadNumberKeeper(a, b), a);
    assert.equal(emailThreadNumberKeeper(b, a), a);
  });

  it("detects only the workspace-number unique violation", () => {
    assert.equal(
      isEmailThreadNumberUniqueViolation({
        code: "23505",
        constraint_name: EMAIL_THREAD_NUMBER_UNIQUE_CONSTRAINT,
      }),
      true,
    );
    assert.equal(
      isEmailThreadNumberUniqueViolation({
        code: "23505",
        constraint_name: "email_threads_workspace_inbox_thread_key_idx",
      }),
      false,
    );
  });

  it("inventory marks the number index as renumber and thread_key as dead_letter", () => {
    const byConstraint = new Map(
      REPLICATED_UNIQUE_FORKS.map((row) => [row.constraint, row.policy]),
    );
    assert.equal(byConstraint.get(EMAIL_THREAD_NUMBER_UNIQUE_CONSTRAINT), "renumber");
    assert.equal(
      byConstraint.get("email_threads_workspace_inbox_thread_key_idx"),
      "dead_letter",
    );
  });
});
