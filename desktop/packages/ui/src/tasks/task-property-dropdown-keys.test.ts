import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent } from "./task-property-dropdown-keys.js";

describe("resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent", () => {
  it("maps list hotkeys without shift", () => {
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "c",
        code: "KeyC",
        shiftKey: false,
      }),
      ["category"],
    );
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "a",
        code: "KeyA",
        shiftKey: false,
      }),
      ["account"],
    );
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "m",
        code: "KeyM",
        shiftKey: false,
      }),
      ["merchant"],
    );
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "o",
        code: "KeyO",
        shiftKey: false,
      }),
      ["merchant"],
    );
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "r",
        code: "KeyR",
        shiftKey: false,
      }),
      ["recurring"],
    );
  });

  it("ignores shift variants (chrome owns those)", () => {
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "c",
        code: "KeyC",
        shiftKey: true,
      }),
      [],
    );
  });

  it("does not map project or goal without a detail panel", () => {
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "p",
        code: "KeyP",
        shiftKey: false,
      }),
      [],
    );
    assert.deepEqual(
      resolveFinanceTxPropertyDropdownOpenCandidatesFromEvent({
        key: "g",
        code: "KeyG",
        shiftKey: false,
      }),
      [],
    );
  });
});
