import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LAST_USED_TOUCH_MAX_ENTRIES,
  apiKeyLastUsedThrottleHasForTests,
  apiKeyLastUsedThrottleSizeForTests,
  fillApiKeyLastUsedThrottleForTests,
  rememberApiKeyLastUsedTouch,
  resetApiKeyLastUsedThrottleForTests,
} from "./api-keys-last-used-throttle.js";

describe("api key last-used throttle map", () => {
  it("stays bounded when many distinct keys are recorded", () => {
    resetApiKeyLastUsedThrottleForTests();
    fillApiKeyLastUsedThrottleForTests(2_100);
    assert.equal(
      apiKeyLastUsedThrottleSizeForTests(),
      LAST_USED_TOUCH_MAX_ENTRIES,
    );
    resetApiKeyLastUsedThrottleForTests();
  });

  it("evicts least-recently-touched keys (LRU), not pure FIFO", () => {
    resetApiKeyLastUsedThrottleForTests();
    const hotKey = "throttle-hot";
    rememberApiKeyLastUsedTouch(hotKey, 1);
    for (let i = 0; i < LAST_USED_TOUCH_MAX_ENTRIES; i += 1) {
      // Re-touch hot key so it stays at the Map end while cold keys fill capacity.
      rememberApiKeyLastUsedTouch(hotKey, 2 + i);
      rememberApiKeyLastUsedTouch(`throttle-cold-${i}`, 2 + i);
    }
    assert.equal(
      apiKeyLastUsedThrottleSizeForTests(),
      LAST_USED_TOUCH_MAX_ENTRIES,
    );
    assert.equal(apiKeyLastUsedThrottleHasForTests(hotKey), true);
    assert.equal(apiKeyLastUsedThrottleHasForTests("throttle-cold-0"), false);
    resetApiKeyLastUsedThrottleForTests();
  });
});
