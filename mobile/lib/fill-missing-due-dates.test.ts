import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillMissingDueDatesFromApi } from "./fill-missing-due-dates";

describe("fillMissingDueDatesFromApi", () => {
  it("copies scheduling when local omitted due date", () => {
    const filled = fillMissingDueDatesFromApi(
      [{ id: "a", due_date: null, updated_at: "2026-09-01T00:00:00.000Z" }],
      [
        {
          id: "a",
          due_date: "2026-09-06T00:00:00.000Z",
          due_end_date: null,
          updated_at: "2026-09-06T00:00:00.000Z",
        },
      ],
    );
    assert.equal(filled[0]?.due_date, "2026-09-06T00:00:00.000Z");
  });

  it("prefers newer API due date when updated_at is newer", () => {
    const filled = fillMissingDueDatesFromApi(
      [
        {
          id: "a",
          due_date: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "a",
          due_date: "2026-09-06T00:00:00.000Z",
          updated_at: "2026-09-06T12:00:00.000Z",
        },
      ],
    );
    assert.equal(filled[0]?.due_date, "2026-09-06T00:00:00.000Z");
  });

  it("keeps local when API is older", () => {
    const filled = fillMissingDueDatesFromApi(
      [
        {
          id: "a",
          due_date: "2026-09-06T00:00:00.000Z",
          updated_at: "2026-09-06T12:00:00.000Z",
        },
      ],
      [
        {
          id: "a",
          due_date: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ],
    );
    assert.equal(filled[0]?.due_date, "2026-09-06T00:00:00.000Z");
  });
});
