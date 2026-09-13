import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  allocateUniqueProjectKey,
  preferredProjectKeyFromDomain,
} from "./project-key.js";

describe("project-key", () => {
  it("prefers the registrable label", () => {
    assert.equal(preferredProjectKeyFromDomain("example.com"), "EXA");
    assert.equal(preferredProjectKeyFromDomain("ab.nl"), "AB");
    assert.equal(preferredProjectKeyFromDomain("x.io"), "DOM");
  });

  it("allocates nearby keys when preferred is taken", () => {
    assert.equal(allocateUniqueProjectKey("EXA", ["EXA"]), "EX2");
  });
});
