import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSelectedJournalDateFromPathname,
  isJournalDetailPath,
  isJournalReservedSlug,
} from "./journal.js";
import {
  getHabitTrackerHref,
  getSelectedHabitIdFromPathname,
  isJournalHabitsPath,
} from "./journal-nav.js";
import { isNavigationPathActive } from "./navigation.js";

describe("journal reserved slugs", () => {
  it("does not treat habits as a journal date", () => {
    assert.equal(isJournalReservedSlug("habits"), true);
    assert.equal(
      getSelectedJournalDateFromPathname("/journal/habits"),
      undefined,
    );
    assert.equal(
      getSelectedJournalDateFromPathname("/journal/habits/abc"),
      undefined,
    );
    assert.equal(isJournalDetailPath("/journal/habits"), false);
    assert.equal(isJournalDetailPath("/journal/2026-08-16"), true);
    assert.equal(
      getSelectedJournalDateFromPathname("/journal/2026-08-16"),
      "2026-08-16",
    );
  });
});

describe("habit tracker paths", () => {
  it("parses habit selection from the URL", () => {
    assert.equal(isJournalHabitsPath("/journal/habits"), true);
    assert.equal(isJournalHabitsPath("/journal/habits/abc"), true);
    assert.equal(isJournalHabitsPath("/journal/2026-08-16"), false);
    assert.equal(getSelectedHabitIdFromPathname("/journal/habits"), undefined);
    assert.equal(getSelectedHabitIdFromPathname("/journal/habits/abc"), "abc");
    assert.equal(getHabitTrackerHref(), "/journal/habits");
    assert.equal(getHabitTrackerHref("all"), "/journal/habits");
    assert.equal(getHabitTrackerHref("abc"), "/journal/habits/abc");
  });

  it("highlights Habit Tracker in the product nav, not Journal", () => {
    assert.equal(isNavigationPathActive("/journal/habits", "/journal"), false);
    assert.equal(
      isNavigationPathActive("/journal/habits/abc", "/journal"),
      false,
    );
    assert.equal(
      isNavigationPathActive("/journal/habits", "/journal/habits"),
      true,
    );
    assert.equal(isNavigationPathActive("/journal/2026-08-16", "/journal"), true);
  });
});
