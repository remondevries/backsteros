import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contactSchema,
  updateContactSchema,
} from "./schemas.js";

describe("contact xUserId", () => {
  it("accepts digits-only ids on PATCH", () => {
    const parsed = updateContactSchema.safeParse({ xUserId: "50254162" });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.xUserId, "50254162");
  });

  it("rejects @handles and non-digit values", () => {
    assert.equal(
      updateContactSchema.safeParse({ xUserId: "@remondevries" }).success,
      false,
    );
    assert.equal(
      updateContactSchema.safeParse({ xUserId: "remondevries" }).success,
      false,
    );
    assert.equal(
      updateContactSchema.safeParse({ xUserId: "5025-4162" }).success,
      false,
    );
  });

  it("allows clearing with null", () => {
    const parsed = updateContactSchema.safeParse({ xUserId: null });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.xUserId, null);
  });

  it("accepts digits-only ids on contact responses", () => {
    const parsed = contactSchema.safeParse({
      id: "c1",
      workspaceId: "ws",
      organizationId: null,
      number: 1,
      key: "C-1",
      name: "Remon",
      firstName: "Remon",
      lastName: "",
      email: null,
      emails: [],
      title: null,
      summary: null,
      avatarStorageKey: null,
      avatarContentType: null,
      sortOrder: 0,
      phone: null,
      phones: [],
      role: null,
      notes: null,
      address: null,
      city: null,
      postalCode: null,
      country: null,
      socialAccounts: [],
      xUserId: "50254162",
      languages: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
    });
    assert.equal(parsed.success, true);
  });
});
