import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  HEALABLE_SOFT_UNIQUE_CONSTRAINTS,
  isForeignKeyViolation,
  isHealableSoftUnique,
  isUniqueViolation,
  readPgError,
} from "./soft-unique-conflicts.js";

describe("soft-unique-conflicts helpers", () => {
  it("reads nested postgres error codes", () => {
    const nested = {
      message: "wrapper",
      cause: {
        code: "23505",
        constraint_name: "tasks_habit_due_unique",
        detail: "Key (habit_id, due_date)=(a, b) already exists.",
      },
    };
    assert.deepEqual(readPgError(nested), {
      code: "23505",
      constraint: "tasks_habit_due_unique",
      detail: "Key (habit_id, due_date)=(a, b) already exists.",
    });
    assert.equal(isUniqueViolation(nested), true);
    assert.equal(isHealableSoftUnique(nested), true);
  });

  it("detects foreign key violations", () => {
    const err = { code: "23503", constraint: "documents_parent_id_documents_id_fk" };
    assert.equal(isForeignKeyViolation(err), true);
    assert.equal(isHealableSoftUnique(err), false);
  });

  it("only heals known soft-unique constraints", () => {
    assert.ok(HEALABLE_SOFT_UNIQUE_CONSTRAINTS.has("tasks_habit_due_unique"));
    assert.equal(
      isHealableSoftUnique({
        code: "23505",
        constraint_name: "some_other_unique",
      }),
      false,
    );
  });
});
