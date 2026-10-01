import assert from "node:assert/strict";
import test from "node:test";

import { mergeLinkedCommitShas } from "./linked-commit-shas.js";

test("mergeLinkedCommitShas replaces, adds, removes with case-insensitive dedupe", () => {
  assert.equal(
    mergeLinkedCommitShas(["abc1234"], undefined, undefined, undefined),
    undefined,
  );

  assert.deepEqual(
    mergeLinkedCommitShas(["abc1234"], ["deadbee"], undefined, undefined),
    ["deadbee"],
  );

  assert.deepEqual(
    mergeLinkedCommitShas(
      ["abc1234"],
      undefined,
      ["ABC1234", "ffffeee"],
      undefined,
    ),
    ["abc1234", "ffffeee"],
  );

  assert.deepEqual(
    mergeLinkedCommitShas(
      ["abc1234", "deadbee"],
      undefined,
      undefined,
      ["ABC1234"],
    ),
    ["deadbee"],
  );

  assert.deepEqual(
    mergeLinkedCommitShas(
      ["abc1234"],
      ["aaaaaaa"],
      ["bbbbbbb"],
      ["AAAAAAA"],
    ),
    ["bbbbbbb"],
  );
});
