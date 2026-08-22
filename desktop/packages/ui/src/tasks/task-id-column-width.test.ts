import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_TASK_ID_COLUMN_CH,
  TASK_ID_COLUMN_CH_SLACK,
  computeTaskDisplayIdColumnCh,
  taskNumberDigitCount,
} from "./task-id-column-width.js";

describe("taskNumberDigitCount", () => {
  test("counts digits for positive integers", () => {
    assert.equal(taskNumberDigitCount(1), 1);
    assert.equal(taskNumberDigitCount(9), 1);
    assert.equal(taskNumberDigitCount(10), 2);
    assert.equal(taskNumberDigitCount(99), 2);
    assert.equal(taskNumberDigitCount(100), 3);
    assert.equal(taskNumberDigitCount(999), 3);
    assert.equal(taskNumberDigitCount(1000), 4);
  });

  test("falls back to 1 for non-positive values", () => {
    assert.equal(taskNumberDigitCount(0), 1);
    assert.equal(taskNumberDigitCount(-3), 1);
    assert.equal(taskNumberDigitCount(Number.NaN), 1);
  });
});

describe("computeTaskDisplayIdColumnCh", () => {
  test("returns the default plus slack when there are no display ids", () => {
    assert.equal(
      computeTaskDisplayIdColumnCh([]),
      DEFAULT_TASK_ID_COLUMN_CH + TASK_ID_COLUMN_CH_SLACK,
    );
    assert.equal(
      computeTaskDisplayIdColumnCh([{ number: null, projectKey: "BSH" }]),
      DEFAULT_TASK_ID_COLUMN_CH + TASK_ID_COLUMN_CH_SLACK,
    );
  });

  test("grows with task number digits for a shared project key", () => {
    const oneDigit = computeTaskDisplayIdColumnCh([
      { number: 1, projectKey: "BSH" },
      { number: 9, projectKey: "BSH" },
    ]);
    const twoDigits = computeTaskDisplayIdColumnCh([
      { number: 1, projectKey: "BSH" },
      { number: 42, projectKey: "BSH" },
    ]);
    const threeDigits = computeTaskDisplayIdColumnCh([
      { number: 1, projectKey: "BSH" },
      { number: 100, projectKey: "BSH" },
    ]);

    assert.equal(oneDigit, "BSH-9".length + TASK_ID_COLUMN_CH_SLACK);
    assert.equal(twoDigits, "BSH-42".length + TASK_ID_COLUMN_CH_SLACK);
    assert.equal(threeDigits, "BSH-100".length + TASK_ID_COLUMN_CH_SLACK);
    assert.ok(twoDigits > oneDigit);
    assert.ok(threeDigits > twoDigits);
  });

  test("uses the widest display id across mixed project keys (global)", () => {
    const ch = computeTaskDisplayIdColumnCh([
      { number: 1, projectKey: "IN" },
      { number: 12, projectKey: "BSH" },
      { number: 3, projectKey: "LONGKEY" },
    ]);
    assert.equal(ch, "LONGKEY-3".length + TASK_ID_COLUMN_CH_SLACK);
  });

  test("project scope stays narrower than a wider global max", () => {
    const projectTasks = [
      { number: 1, projectKey: "BSH" },
      { number: 8, projectKey: "BSH" },
    ];
    const allTasks = [...projectTasks, { number: 120, projectKey: "OTHER" }];

    assert.equal(
      computeTaskDisplayIdColumnCh(projectTasks),
      "BSH-8".length + TASK_ID_COLUMN_CH_SLACK,
    );
    assert.equal(
      computeTaskDisplayIdColumnCh(allTasks),
      "OTHER-120".length + TASK_ID_COLUMN_CH_SLACK,
    );
  });
});
