import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate,
} from "./parse-natural-language-due-date.ts";

describe("parseNaturalLanguageDueDate", () => {
  const ref = new Date(2026, 6, 21, 12, 0, 0); // Tue Jul 21, 2026

  it("parses past phrases and unique prefixes", () => {
    assert.equal(
      (parseNaturalLanguageDueDate("yesterday", ref) as { ymd: string }).ymd,
      "2026-07-20",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("yest", ref) as { ymd: string }).ymd,
      "2026-07-20",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("two days ago", ref) as { ymd: string }).ymd,
      "2026-07-19",
    );
    assert.equal(
      (parseNaturalLanguageDueDate("last week", ref) as { ymd: string }).ymd,
      "2026-07-14",
    );
    assert.match(
      naturalLanguageDueDatePreview("yest", ref) ?? "",
      /^Set to /,
    );
  });
});
