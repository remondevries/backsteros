import assert from "node:assert/strict";
import test from "node:test";

import {
  propsEqualIgnoringCallbacks,
  propsEqualIgnoringCallbacksExcept,
} from "./stable-callback-props.ts";

test("propsEqualIgnoringCallbacks ignores callback identity", () => {
  const rows = [1, 2];
  assert.equal(
    propsEqualIgnoringCallbacks(
      { rows, label: "a", onOpen: () => 1 },
      { rows, label: "a", onOpen: () => 2 },
    ),
    true,
  );
});

test("propsEqualIgnoringCallbacks compares data props by identity", () => {
  const onOpen = () => undefined;
  assert.equal(
    propsEqualIgnoringCallbacks({ rows: [1], onOpen }, { rows: [1], onOpen }),
    false,
  );
  assert.equal(
    propsEqualIgnoringCallbacks({ label: "a" }, { label: "b" }),
    false,
  );
});

test("propsEqualIgnoringCallbacks notices callbacks appearing or vanishing", () => {
  assert.equal(
    propsEqualIgnoringCallbacks<{ onOpen?: () => void }>(
      {},
      { onOpen: () => undefined },
    ),
    false,
  );
  assert.equal(
    propsEqualIgnoringCallbacks<{ onOpen?: () => void }>(
      { onOpen: () => undefined },
      { onOpen: undefined },
    ),
    false,
  );
});

test("propsEqualIgnoringCallbacksExcept compares listed functions by identity", () => {
  const equal = propsEqualIgnoringCallbacksExcept<{
    resolve: () => number;
    onOpen: () => void;
  }>(["resolve"]);
  const resolve = () => 1;
  assert.equal(
    equal({ resolve, onOpen: () => {} }, { resolve, onOpen: () => {} }),
    true,
  );
  assert.equal(
    equal({ resolve, onOpen: () => {} }, { resolve: () => 1, onOpen: () => {} }),
    false,
  );
});
