import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DOCUMENT_LIST_MAX_LIMIT } from "@backsteros/contracts";

import {
  applyDocumentListPagination,
  camelToKebab,
  documentMatchesPropertyFilters,
  parseDocumentListTypeFilter,
  parseExactMultiQueryValues,
  parseMultiQueryValues,
  propertiesLinkTask,
  resolveDocumentListPagination,
  resolveSectionIfMatchVersion,
} from "./document-property-filters.ts";

describe("document property filters", () => {
  it("normalizes camelCase to kebab-case", () => {
    assert.equal(camelToKebab("houseRule"), "house-rule");
    assert.deepEqual(parseMultiQueryValues("houseRule,runbook"), [
      "house-rule",
      "runbook",
    ]);
  });

  it("keeps project keys uppercase (project=OS survives unchanged)", () => {
    assert.deepEqual(parseExactMultiQueryValues("OS"), ["OS"]);
    assert.deepEqual(parseExactMultiQueryValues(["OS", "BDV"]), ["OS", "BDV"]);
    // Property-style normalize would wrongly lower-case — do not use it for project.
    assert.deepEqual(parseMultiQueryValues("OS"), ["os"]);
  });

  it("parses repeated and comma-separated values", () => {
    assert.deepEqual(parseMultiQueryValues(["agents", "remon,client"]), [
      "agents",
      "remon",
      "client",
    ]);
  });

  it("keeps structural document types separate from property types", () => {
    assert.deepEqual(parseDocumentListTypeFilter("knowledge"), {
      kind: "documentType",
      values: ["knowledge"],
    });
    assert.deepEqual(parseDocumentListTypeFilter("house-rule,guide"), {
      kind: "propertyType",
      values: ["house-rule", "guide"],
    });
    assert.equal(parseDocumentListTypeFilter("knowledge,house-rule").kind, "mixed");
    assert.equal(parseDocumentListTypeFilter(undefined).kind, "none");
  });

  it("matches single, multi-value and combined property filters", () => {
    const doc = {
      type: "house-rule",
      audience: "agents",
      status: "current",
      project: "OS",
    };
    assert.equal(
      documentMatchesPropertyFilters(doc, { propertyType: ["house-rule"] }),
      true,
    );
    assert.equal(
      documentMatchesPropertyFilters(doc, {
        propertyType: ["runbook", "house-rule"],
      }),
      true,
    );
    assert.equal(
      documentMatchesPropertyFilters(doc, {
        propertyType: ["house-rule"],
        audience: ["agents"],
        status: ["current"],
      }),
      true,
    );
    assert.equal(
      documentMatchesPropertyFilters(doc, {
        propertyType: ["house-rule"],
        status: ["archived"],
      }),
      false,
    );
    assert.equal(
      documentMatchesPropertyFilters({}, { propertyType: ["house-rule"] }),
      false,
    );
  });

  it("links documents to a task via linkedTasks and not to other tasks", () => {
    const props = { linkedTasks: ["OS-30", "OS-26"] };
    assert.equal(propertiesLinkTask(props, "OS-30"), true);
    assert.equal(propertiesLinkTask(props, "OS-99"), false);
    assert.equal(propertiesLinkTask({}, "OS-30"), false);
    assert.equal(propertiesLinkTask({ linkedTasks: "OS-30" }, "OS-30"), true);
    assert.equal(propertiesLinkTask({ linkedTasks: "OS-30" }, "OS-99"), false);
  });

  it("defaults section ifMatchVersion to the version just read", () => {
    assert.equal(resolveSectionIfMatchVersion(undefined, 7), 7);
    assert.equal(resolveSectionIfMatchVersion(3, 7), 3);
  });

  it("resolves document list limit/offset (omit = all, clamp max)", () => {
    assert.deepEqual(resolveDocumentListPagination(undefined), {
      limit: undefined,
      offset: undefined,
    });
    assert.deepEqual(resolveDocumentListPagination({}), {
      limit: undefined,
      offset: undefined,
    });
    assert.deepEqual(resolveDocumentListPagination({ limit: 2 }), {
      limit: 2,
      offset: 0,
    });
    assert.deepEqual(
      resolveDocumentListPagination({ limit: 2, offset: 10 }),
      { limit: 2, offset: 10 },
    );
    assert.deepEqual(
      resolveDocumentListPagination({ limit: 9999, offset: -3 }),
      { limit: DOCUMENT_LIST_MAX_LIMIT, offset: 0 },
    );
    assert.deepEqual(resolveDocumentListPagination({ limit: 0 }), {
      limit: 1,
      offset: 0,
    });
  });

  it("applies limit after filters both with and without property filters", () => {
    function mockQuery() {
      const seen: { limit?: number; offset?: number } = {};
      const self = {
        // Stand-in for the already-filtered drizzle chain (WHERE applied).
        filtersApplied: true as const,
        limit(n: number) {
          seen.limit = n;
          return self;
        },
        offset(n: number) {
          seen.offset = n;
          return self;
        },
        seen,
      };
      return self;
    }

    // No property filters — limit still applied on the filtered query.
    const withoutFilters = mockQuery();
    assert.equal(withoutFilters.filtersApplied, true);
    applyDocumentListPagination(withoutFilters, { limit: 2 });
    assert.deepEqual(withoutFilters.seen, { limit: 2 });

    // With property filters already in WHERE — limit/offset still applied after.
    const withFilters = mockQuery();
    assert.equal(withFilters.filtersApplied, true);
    applyDocumentListPagination(withFilters, {
      limit: 2,
      offset: 4,
    });
    assert.deepEqual(withFilters.seen, { limit: 2, offset: 4 });

    // Omit limit → no SQL limit (full list for desktop clients).
    const unbounded = mockQuery();
    applyDocumentListPagination(unbounded, {});
    assert.deepEqual(unbounded.seen, {});
  });
});
