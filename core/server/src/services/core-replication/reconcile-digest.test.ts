import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  buildRowDigest,
  digestExtraColumnsFor,
  fingerprintLine,
  planReconcile,
} from "./reconcile-digest.js";

const T = "2026-11-01T10:00:00.000Z";

function fingerprint(entries: { key: string; digest: string }[]): string {
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(fingerprintLine(entry));
  return hash.digest("hex");
}

describe("row digests", () => {
  it("keeps the legacy key|updated_at shape for tables without extras", () => {
    assert.deepEqual(digestExtraColumnsFor("tasks"), []);
    assert.equal(buildRowDigest(T), T);
    assert.equal(fingerprintLine({ key: "a", digest: T }), `a|${T}\n`);
  });

  it("entity_counters digest includes next_value", () => {
    assert.deepEqual(digestExtraColumnsFor("entity_counters"), ["next_value"]);
    assert.equal(buildRowDigest(T, ["5"]), `${T}|5`);
  });

  it("fingerprint differs when only next_value differs at equal updated_at", () => {
    const key = "ws|task|__inbox__";
    const a = fingerprint([{ key, digest: buildRowDigest(T, ["5"]) }]);
    const b = fingerprint([{ key, digest: buildRowDigest(T, ["9"]) }]);
    assert.notEqual(a, b);
    // Without the content digest the two cores would look identical.
    const legacyA = fingerprint([{ key, digest: buildRowDigest(T) }]);
    const legacyB = fingerprint([{ key, digest: buildRowDigest(T) }]);
    assert.equal(legacyA, legacyB);
  });
});

describe("planReconcile", () => {
  it("reports drift with zero missing ids", () => {
    const local = new Map([
      ["a", buildRowDigest(T, ["5"])],
      ["b", buildRowDigest(T, ["7"])],
    ]);
    const peerDigests = new Map([
      ["a", buildRowDigest(T, ["9"])],
      ["b", buildRowDigest(T, ["7"])],
    ]);
    const plan = planReconcile(local, new Set(peerDigests.keys()), peerDigests);
    assert.deepEqual(plan.missingLocally, []);
    assert.deepEqual(plan.missingOnPeer, []);
    assert.deepEqual(plan.drifted, ["a"]);
  });

  it("separates missing ids from drift", () => {
    const local = new Map([
      ["a", "t1"],
      ["only-local", "t1"],
    ]);
    const peerDigests = new Map([
      ["a", "t2"],
      ["only-peer", "t1"],
    ]);
    const plan = planReconcile(local, new Set(peerDigests.keys()), peerDigests);
    assert.deepEqual(plan.missingLocally, ["only-peer"]);
    assert.deepEqual(plan.missingOnPeer, ["only-local"]);
    assert.deepEqual(plan.drifted, ["a"]);
  });

  it("cannot determine drift when the peer returned keys only", () => {
    const local = new Map([["a", "t1"]]);
    const plan = planReconcile(local, new Set(["a"]), null);
    assert.deepEqual(plan.drifted, []);
  });
});
