import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  DOCUMENT_VERSION_ROW_COMPARATOR,
  WORKSPACE_LIST_ROW_COMPARATOR,
} from "./powersync-row-comparators.ts";

test("WORKSPACE_LIST_ROW_COMPARATOR keys by id and compares updated_at only", () => {
  const a = { id: "t1", title: "A", updated_at: "2026-01-01" };
  const b = { id: "t1", title: "B", updated_at: "2026-01-01" };
  const c = { id: "t1", title: "B", updated_at: "2026-01-02" };

  assert.equal(WORKSPACE_LIST_ROW_COMPARATOR.keyBy(a), "t1");
  assert.equal(WORKSPACE_LIST_ROW_COMPARATOR.compareBy(a), "2026-01-01");
  assert.equal(
    WORKSPACE_LIST_ROW_COMPARATOR.compareBy(a),
    WORKSPACE_LIST_ROW_COMPARATOR.compareBy(b),
  );
  assert.notEqual(
    WORKSPACE_LIST_ROW_COMPARATOR.compareBy(b),
    WORKSPACE_LIST_ROW_COMPARATOR.compareBy(c),
  );
});

test("DOCUMENT_VERSION_ROW_COMPARATOR includes content_version", () => {
  const row = {
    id: "d1",
    content_version: 3,
    content_etag: "abc",
    updated_at: "2026-01-01",
  };
  assert.equal(DOCUMENT_VERSION_ROW_COMPARATOR.keyBy(row), "d1");
  assert.match(DOCUMENT_VERSION_ROW_COMPARATOR.compareBy(row), /^3/);
});
