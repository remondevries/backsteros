import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  guardCloudApiKeyApplyFromLocal,
  resolveCloudWorkspaceOwnerUserId,
} from "./cloud-key-apply-guard.js";

const EXISTING = {
  name: "Ralph",
  scopes: ["finance:write"],
  expiresAt: null as Date | null,
  revokedAt: null as Date | null,
  userId: "owner-1",
  contactId: "contact-ralph",
};

describe("guardCloudApiKeyApplyFromLocal", () => {
  it("accepts a name change", () => {
    const result = guardCloudApiKeyApplyFromLocal(EXISTING, {
      ...EXISTING,
      name: "Ralph (renamed)",
    });
    assert.equal(result.name, "Ralph (renamed)");
    assert.deepEqual(result.ignoredFields, []);
  });

  it("accepts a new revocation (null → value)", () => {
    const revokedAt = new Date("2026-11-16T12:00:00.000Z");
    const result = guardCloudApiKeyApplyFromLocal(EXISTING, {
      ...EXISTING,
      revokedAt,
    });
    assert.equal(result.revokedAt?.toISOString(), revokedAt.toISOString());
    assert.deepEqual(result.ignoredFields, []);
  });

  it("ignores un-revocation (value → null)", () => {
    const revokedAt = new Date("2026-11-16T12:00:00.000Z");
    const result = guardCloudApiKeyApplyFromLocal(
      { ...EXISTING, revokedAt },
      { ...EXISTING, revokedAt: null },
    );
    assert.equal(result.revokedAt?.toISOString(), revokedAt.toISOString());
    assert.deepEqual(result.ignoredFields, ["revoked_at"]);
  });

  it("ignores a changed revoked_at timestamp", () => {
    const first = new Date("2026-11-16T12:00:00.000Z");
    const second = new Date("2026-11-17T12:00:00.000Z");
    const result = guardCloudApiKeyApplyFromLocal(
      { ...EXISTING, revokedAt: first },
      { ...EXISTING, revokedAt: second },
    );
    assert.equal(result.revokedAt?.toISOString(), first.toISOString());
    assert.deepEqual(result.ignoredFields, ["revoked_at"]);
  });

  it("ignores scopes, expires_at, user_id and contact_id changes", () => {
    const result = guardCloudApiKeyApplyFromLocal(EXISTING, {
      name: "Ralph",
      scopes: ["finance:write", "settings:write"],
      expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      revokedAt: null,
      userId: "attacker",
      contactId: null,
    });
    assert.deepEqual(result.scopes, ["finance:write"]);
    assert.equal(result.expiresAt, null);
    assert.equal(result.userId, "owner-1");
    assert.equal(result.contactId, "contact-ralph");
    assert.deepEqual(result.ignoredFields.sort(), [
      "contact_id",
      "expires_at",
      "scopes",
      "user_id",
    ]);
  });
});

describe("resolveCloudWorkspaceOwnerUserId", () => {
  it("keeps the existing cloud owner when local tries to change it", () => {
    const result = resolveCloudWorkspaceOwnerUserId("owner-cloud", "owner-mac");
    assert.deepEqual(result, { ownerUserId: "owner-cloud", ignored: true });
  });

  it("accepts inbound owner when cloud has none", () => {
    const result = resolveCloudWorkspaceOwnerUserId(null, "owner-mac");
    assert.deepEqual(result, { ownerUserId: "owner-mac", ignored: false });
  });

  it("is a no-op when owners match", () => {
    const result = resolveCloudWorkspaceOwnerUserId("owner-1", "owner-1");
    assert.deepEqual(result, { ownerUserId: "owner-1", ignored: false });
  });
});
