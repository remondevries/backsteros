import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apiKeyLastUsedThrottleSizeForTests,
  fillApiKeyLastUsedThrottleForTests,
  resetApiKeyLastUsedThrottleForTests,
} from "./api-keys.js";

describe("api key last-used throttle map", () => {
  it("stays bounded when many distinct keys are recorded", () => {
    resetApiKeyLastUsedThrottleForTests();
    fillApiKeyLastUsedThrottleForTests(2_100);
    assert.equal(apiKeyLastUsedThrottleSizeForTests(), 2_048);
    resetApiKeyLastUsedThrottleForTests();
  });
});
