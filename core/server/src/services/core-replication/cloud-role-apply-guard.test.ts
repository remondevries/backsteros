import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SAFE_USER_ROLE_FROM_LOCAL,
  SAFE_WORKSPACE_MEMBER_ROLE_FROM_LOCAL,
  isElevatedCloudRole,
  resolveCloudRoleFromLocal,
} from "./cloud-role-apply-guard.js";

describe("isElevatedCloudRole", () => {
  it("flags owner and admin", () => {
    assert.equal(isElevatedCloudRole("owner"), true);
    assert.equal(isElevatedCloudRole("Admin"), true);
    assert.equal(isElevatedCloudRole("member"), false);
    assert.equal(isElevatedCloudRole(null), false);
  });
});

describe("resolveCloudRoleFromLocal", () => {
  it("keeps the existing cloud role when local tries to change it", () => {
    const result = resolveCloudRoleFromLocal(
      "member",
      "owner",
      SAFE_WORKSPACE_MEMBER_ROLE_FROM_LOCAL,
    );
    assert.deepEqual(result, {
      role: "member",
      ignored: true,
      demoted: false,
    });
  });

  it("is a no-op when roles already match", () => {
    const result = resolveCloudRoleFromLocal(
      "owner",
      "owner",
      SAFE_USER_ROLE_FROM_LOCAL,
    );
    assert.deepEqual(result, {
      role: "owner",
      ignored: false,
      demoted: false,
    });
  });

  it("demotes elevated roles on new users rows", () => {
    const result = resolveCloudRoleFromLocal(
      null,
      "owner",
      SAFE_USER_ROLE_FROM_LOCAL,
    );
    assert.deepEqual(result, {
      role: SAFE_USER_ROLE_FROM_LOCAL,
      ignored: false,
      demoted: true,
    });
  });

  it("demotes elevated roles on new workspace_members rows", () => {
    const result = resolveCloudRoleFromLocal(
      undefined,
      "admin",
      SAFE_WORKSPACE_MEMBER_ROLE_FROM_LOCAL,
    );
    assert.deepEqual(result, {
      role: SAFE_WORKSPACE_MEMBER_ROLE_FROM_LOCAL,
      ignored: false,
      demoted: true,
    });
  });

  it("accepts a non-elevated role on a new row", () => {
    const result = resolveCloudRoleFromLocal(
      null,
      "member",
      SAFE_WORKSPACE_MEMBER_ROLE_FROM_LOCAL,
    );
    assert.deepEqual(result, {
      role: "member",
      ignored: false,
      demoted: false,
    });
  });
});
