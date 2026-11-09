import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  countHostChromeOpsAcrossSlotRebuilds,
  hostChromeOpsForSlotsTransition,
  shouldClearHostChromeOnLayoutCleanup,
} from "./host-chrome-publish.js";

describe("host chrome publish policy (Start-room registration storm)", () => {
  test("slots identity change alone must not clear chrome", () => {
    assert.equal(
      shouldClearHostChromeOnLayoutCleanup({
        slotsIdentityChanged: true,
        hostCallbackTeardown: false,
      }),
      false,
    );
  });

  test("genuine host teardown clears chrome", () => {
    assert.equal(
      shouldClearHostChromeOnLayoutCleanup({
        slotsIdentityChanged: false,
        hostCallbackTeardown: true,
      }),
      true,
    );
  });

  test("buggy clear-on-slots policy storms clear+publish per rebuild", () => {
    // enumerateDevices / mute / theme each rebuild slots during Start room.
    const buggy = countHostChromeOpsAcrossSlotRebuilds({
      slotRebuilds: 5,
      clearOnSlotsChange: true,
    });
    assert.equal(buggy.publishes, 5);
    assert.equal(
      buggy.clears,
      4,
      "old cleanup cleared on every slots identity change after the first",
    );
    assert.deepEqual(
      hostChromeOpsForSlotsTransition({
        hadPreviousSlots: true,
        clearOnSlotsChange: true,
      }),
      ["clear", "publish"],
    );
  });

  test("fixed policy publishes without clear across slots rebuilds", () => {
    const fixed = countHostChromeOpsAcrossSlotRebuilds({
      slotRebuilds: 5,
      clearOnSlotsChange: false,
    });
    assert.equal(fixed.publishes, 5);
    assert.equal(fixed.clears, 0);
    assert.deepEqual(
      hostChromeOpsForSlotsTransition({
        hadPreviousSlots: true,
        clearOnSlotsChange: false,
      }),
      ["publish"],
    );
  });
});
