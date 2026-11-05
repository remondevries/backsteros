import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveTransactionalFromAddress } from "./agentmail-transactional.js";

describe("resolveTransactionalFromAddress", () => {
  it("uses hallo@lemo-design.nl for Dutch portal UI", () => {
    assert.deepEqual(resolveTransactionalFromAddress("nl"), {
      email: "hallo@lemo-design.nl",
      domain: "lemo-design.nl",
    });
  });

  it("uses hello@lemo-design.com for English and unknown locales", () => {
    assert.equal(
      resolveTransactionalFromAddress("en").email,
      "hello@lemo-design.com",
    );
    assert.equal(
      resolveTransactionalFromAddress(null).email,
      "hello@lemo-design.com",
    );
    assert.equal(
      resolveTransactionalFromAddress("de").email,
      "hello@lemo-design.com",
    );
  });
});
