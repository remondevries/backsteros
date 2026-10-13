import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_PROJECT_KEY_COLUMN_CH,
  PROJECT_KEY_COLUMN_CH_SLACK,
  computeProjectKeyColumnCh,
} from "./project-key-column-width.js";

describe("computeProjectKeyColumnCh", () => {
  test("returns the default plus slack when there are no keys", () => {
    assert.equal(
      computeProjectKeyColumnCh([]),
      DEFAULT_PROJECT_KEY_COLUMN_CH + PROJECT_KEY_COLUMN_CH_SLACK,
    );
    assert.equal(
      computeProjectKeyColumnCh([{ key: null }, { key: "  " }]),
      DEFAULT_PROJECT_KEY_COLUMN_CH + PROJECT_KEY_COLUMN_CH_SLACK,
    );
  });

  test("grows with the widest project key", () => {
    const twoChar = computeProjectKeyColumnCh([
      { key: "IN" },
      { key: "AB" },
    ]);
    const threeChar = computeProjectKeyColumnCh([
      { key: "IN" },
      { key: "BSH" },
    ]);

    // Two-char keys stay at the default floor (3) + slack.
    assert.equal(
      twoChar,
      DEFAULT_PROJECT_KEY_COLUMN_CH + PROJECT_KEY_COLUMN_CH_SLACK,
    );
    assert.equal(threeChar, "BSH".length + PROJECT_KEY_COLUMN_CH_SLACK);
    assert.equal(twoChar, threeChar);
  });

  test("uses the widest key across the full list", () => {
    const ch = computeProjectKeyColumnCh([
      { key: "A" },
      { key: "XY" },
      { key: "LONG" },
    ]);
    assert.equal(ch, "LONG".length + PROJECT_KEY_COLUMN_CH_SLACK);
  });
});
