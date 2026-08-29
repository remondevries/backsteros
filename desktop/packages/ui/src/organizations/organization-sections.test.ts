import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ORGANIZATION_SECTION_IDS,
  resolveVisibleOrganizationSections,
} from "../../dist/organizations/organization-sections.js";

describe("resolveVisibleOrganizationSections", () => {
  it("hides finance tabs by default", () => {
    assert.deepEqual(
      resolveVisibleOrganizationSections().map((entry) => entry.id),
      ["overview", "activity", "projects", "letters", "contacts"],
    );
  });

  it("shows transactions and invoices only when linked data exists", () => {
    assert.deepEqual(
      resolveVisibleOrganizationSections({
        hasTransactions: true,
        hasInvoices: true,
      }).map((entry) => entry.id),
      [...ORGANIZATION_SECTION_IDS],
    );
    assert.deepEqual(
      resolveVisibleOrganizationSections({
        hasTransactions: true,
      }).map((entry) => entry.id),
      [
        "overview",
        "activity",
        "projects",
        "letters",
        "contacts",
        "transactions",
      ],
    );
    assert.deepEqual(
      resolveVisibleOrganizationSections({
        hasInvoices: true,
      }).map((entry) => entry.id),
      ["overview", "activity", "projects", "letters", "contacts", "invoices"],
    );
  });
});
