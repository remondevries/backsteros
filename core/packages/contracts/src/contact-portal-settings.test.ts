import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contactPortalSettingsSchema,
  DEFAULT_CONTACT_PORTAL_SETTINGS,
  updateContactSchema,
} from "./schemas.js";

describe("contactPortalSettingsSchema", () => {
  it("accepts enabledProjectIds null (all projects)", () => {
    const parsed = contactPortalSettingsSchema.safeParse({
      languages: ["en"],
      enabledProjectIds: null,
      financials: true,
      support: true,
      canAddTickets: true,
      canAddTasks: true,
    });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.enabledProjectIds, null);
  });

  it("defaults match all-projects + modules on", () => {
    const parsed = contactPortalSettingsSchema.safeParse({});
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data, DEFAULT_CONTACT_PORTAL_SETTINGS);
    assert.equal(parsed.data.enabledProjectIds, null);
    assert.equal(parsed.data.financials, true);
  });

  it("migrates legacy language into languages", () => {
    const parsed = contactPortalSettingsSchema.safeParse({
      language: "nl",
      enabledProjectIds: [],
      financials: false,
    });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.deepEqual(parsed.data.languages, ["nl"]);
  });

  it("allows portalSettings with null enabledProjectIds on contact PATCH", () => {
    const parsed = updateContactSchema.safeParse({
      portalSettings: {
        languages: ["en"],
        enabledProjectIds: null,
        financials: true,
        support: true,
        canAddTickets: true,
        canAddTasks: true,
      },
    });
    assert.equal(parsed.success, true);
  });
});
