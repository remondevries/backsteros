import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveVisibleOrganizationSections,
} from "./organization-sections.js";

describe("resolveVisibleOrganizationSections", () => {
  it("hides transactions/invoices by default but keeps estimates", () => {
    assert.deepEqual(
      resolveVisibleOrganizationSections().map((entry) => entry.id),
      [
        "overview",
        "activity",
        "projects",
        "letters",
        "emails",
        "contacts",
        "estimates",
      ],
    );
  });

  it("shows transactions and invoices only when linked data exists", () => {
    assert.deepEqual(
      resolveVisibleOrganizationSections({
        hasTransactions: true,
        hasInvoices: true,
      }).map((entry) => entry.id),
      [
        "overview",
        "activity",
        "projects",
        "letters",
        "emails",
        "contacts",
        "transactions",
        "estimates",
        "invoices",
      ],
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
        "emails",
        "contacts",
        "transactions",
        "estimates",
      ],
    );
    assert.deepEqual(
      resolveVisibleOrganizationSections({
        hasInvoices: true,
      }).map((entry) => entry.id),
      [
        "overview",
        "activity",
        "projects",
        "letters",
        "emails",
        "contacts",
        "estimates",
        "invoices",
      ],
    );
    assert.deepEqual(
      resolveVisibleOrganizationSections({
        hasEstimates: false,
      }).map((entry) => entry.id),
      ["overview", "activity", "projects", "letters", "emails", "contacts"],
    );
  });
});
