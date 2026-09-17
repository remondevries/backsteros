import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPortalUsernameUniqueViolation,
  PortalUsernameConflictError,
  rethrowPortalUsernameConflict,
} from "./portal-contact-auth.js";

describe("portal-contact-auth", () => {
  it("detects portal username unique violations", () => {
    assert.equal(
      isPortalUsernameUniqueViolation({
        code: "23505",
        constraint: "contacts_workspace_portal_username_unique",
      }),
      true,
    );
    assert.equal(
      isPortalUsernameUniqueViolation({
        code: "23505",
        constraint: "tasks_workspace_scope_number_unique",
      }),
      false,
    );
  });

  it("maps portal username unique violations to PortalUsernameConflictError", () => {
    assert.throws(
      () =>
        rethrowPortalUsernameConflict({
          code: "23505",
          constraint: "contacts_workspace_portal_username_unique",
        }),
      PortalUsernameConflictError,
    );
  });
});
