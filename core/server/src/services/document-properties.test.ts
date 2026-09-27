import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyMirrorFrontMatter,
  buildPropertiesIndex,
} from "../lib/document-core-property-schema.ts";

describe("document properties index", () => {
  it("overwrites audience mirror from row", () => {
    const merged = applyMirrorFrontMatter(
      { audience: "individual" },
      { audience: "agents" },
      null,
    );
    assert.equal(merged.audience, "remon");
  });

  it("indexes scalar properties", () => {
    const index = buildPropertiesIndex({
      type: "runbook",
      status: "current",
    });
    assert.equal(index.type, "runbook");
    assert.equal(index.status, "current");
  });
});
