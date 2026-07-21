import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseNaturalLanguageDueDate } from "./parse-natural-language-due-date.js";

describe("parseNaturalLanguageDueDate", () => {
  const ref = new Date(2026, 6, 21, 12, 0, 0); // Tue Jul 21, 2026

  it("parses future relative phrases", () => {
    assert.equal(parseNaturalLanguageDueDate("tomorrow", ref).kind, "date");
    assert.equal(
      (parseNaturalLanguageDueDate("tomorrow", ref) as { ymd: string }).ymd,
      "2026-07-22",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("in 2 weeks", ref) as { ymd: string }).ymd,
      "2026-08-04",
    );
    assert.equal(
      (
        parseNaturalLanguageDueDate("two weeks from now", ref) as { ymd: string }
      ).ymd,
      "2026-08-04",
    );
  });

  it("parses past relative phrases", () => {
    assert.equal(
      (parseNaturalLanguageDueDate("yesterday", ref) as { ymd: string }).ymd,
      "2026-07-20",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("two weeks ago", ref) as { ymd: string }).ymd,
      "2026-07-07",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("one week ago", ref) as { ymd: string }).ymd,
      "2026-07-14",
    );
    assert.equal(
      (
        parseNaturalLanguageDueDate("two weeks in the past", ref) as {
          ymd: string;
        }
      ).ymd,
      "2026-07-07",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("last Friday", ref) as { ymd: string }).ymd,
      "2026-07-17",
    );
  });

  it("clears due date on clear phrases", () => {
    assert.equal(parseNaturalLanguageDueDate("no due date", ref).kind, "clear");
    assert.equal(parseNaturalLanguageDueDate("none", ref).kind, "clear");
  });
});
