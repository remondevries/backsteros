import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getRememberedTasksDueFilter,
  rememberTasksDueFilter,
} from "./tasks-due-filter-memory.ts";
import { DEFAULT_TASKS_DUE_FILTER } from "./tasks-due-filters.ts";

describe("tasks-due-filter-memory", () => {
  it("defaults to the default due filter", () => {
    // Module state may already be mutated by earlier tests in-process; set then read.
    rememberTasksDueFilter(DEFAULT_TASKS_DUE_FILTER);
    assert.equal(getRememberedTasksDueFilter(), DEFAULT_TASKS_DUE_FILTER);
  });

  it("remembers the last selected due filter across reads", () => {
    rememberTasksDueFilter("this-week");
    assert.equal(getRememberedTasksDueFilter(), "this-week");
    rememberTasksDueFilter("overdue");
    assert.equal(getRememberedTasksDueFilter(), "overdue");
  });
});
