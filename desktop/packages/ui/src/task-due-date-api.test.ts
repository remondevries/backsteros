import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTaskSchema } from "@backsteros/contracts";

import { parseYmdLocal, toApiDueDateIso } from "./task-due-date.js";

describe("toApiDueDateIso", () => {
  it("returns null for empty values", () => {
    assert.equal(toApiDueDateIso(null), null);
    assert.equal(toApiDueDateIso(undefined), null);
    assert.equal(toApiDueDateIso(""), null);
    assert.equal(toApiDueDateIso("   "), null);
  });

  it("converts YMD calendar strings to ISO datetime", () => {
    const iso = toApiDueDateIso("2026-07-31");
    assert.ok(iso);
    assert.equal(iso, parseYmdLocal("2026-07-31")!.toISOString());
    assert.equal(createTaskSchema.safeParse({ title: "t", dueDate: iso }).success, true);
  });

  it("rejects raw YMD against the create-task API schema", () => {
    assert.equal(
      createTaskSchema.safeParse({ title: "t", dueDate: "2026-07-31" }).success,
      false,
    );
  });

  it("passes through ISO datetimes", () => {
    const iso = "2026-07-31T12:30:00.000Z";
    assert.equal(toApiDueDateIso(iso), iso);
  });

  it("serializes Date instances", () => {
    const date = new Date("2026-07-31T12:30:00.000Z");
    assert.equal(toApiDueDateIso(date), date.toISOString());
  });
});
