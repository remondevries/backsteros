import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate,
} from "./parse-natural-language-due-date.js";

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
      (parseNaturalLanguageDueDate("two days ago", ref) as { ymd: string }).ymd,
      "2026-07-19",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("three days ago", ref) as { ymd: string })
        .ymd,
      "2026-07-18",
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
    assert.equal(
      (parseNaturalLanguageDueDate("last week", ref) as { ymd: string }).ymd,
      "2026-07-14",
    );
  });

  it("expands unique phrase prefixes before parsing", () => {
    assert.equal(
      (parseNaturalLanguageDueDate("yest", ref) as { ymd: string }).ymd,
      "2026-07-20",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("yes", ref) as { ymd: string }).ymd,
      "2026-07-20",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("tom", ref) as { ymd: string }).ymd,
      "2026-07-22",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("tod", ref) as { ymd: string }).ymd,
      "2026-07-21",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("last w", ref) as { ymd: string }).ymd,
      "2026-07-14",
    );
    assert.match(
      naturalLanguageDueDatePreview("yest", ref) ?? "",
      /^Set to /,
    );
    // Ambiguous: "last" matches last week + last month — do not expand
    assert.equal(parseNaturalLanguageDueDate("last", ref).kind, "invalid");
  });

  it("clears due date on clear phrases", () => {
    assert.equal(parseNaturalLanguageDueDate("no due date", ref).kind, "clear");
    assert.equal(parseNaturalLanguageDueDate("none", ref).kind, "clear");
    assert.equal(parseNaturalLanguageDueDate("non", ref).kind, "clear");
    assert.equal(parseNaturalLanguageDueDate("cle", ref).kind, "clear");
  });
});
