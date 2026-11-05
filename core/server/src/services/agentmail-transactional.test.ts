import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeTransactionalMailPurpose,
  resolveTransactionalFromAddress,
} from "./agentmail-transactional.js";

describe("resolveTransactionalFromAddress", () => {
  it("uses hallo@lemo-design.nl for Dutch general mail", () => {
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

  it("uses financieel / financials for invoice purpose", () => {
    assert.deepEqual(resolveTransactionalFromAddress("nl", "invoice"), {
      email: "financieel@lemo-design.nl",
      domain: "lemo-design.nl",
    });
    assert.equal(
      resolveTransactionalFromAddress("en", "invoice").email,
      "financials@lemo-design.com",
    );
    assert.equal(
      resolveTransactionalFromAddress(null, "invoice").email,
      "financials@lemo-design.com",
    );
  });
});

describe("normalizeTransactionalMailPurpose", () => {
  it("defaults unknown values to general", () => {
    assert.equal(normalizeTransactionalMailPurpose("invoice"), "invoice");
    assert.equal(normalizeTransactionalMailPurpose("general"), "general");
    assert.equal(normalizeTransactionalMailPurpose(null), "general");
    assert.equal(normalizeTransactionalMailPurpose("other"), "general");
  });
});
