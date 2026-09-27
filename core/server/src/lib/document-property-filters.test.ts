import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  camelToKebab,
  documentMatchesPropertyFilters,
  parseDocumentListTypeFilter,
  parseMultiQueryValues,
  propertiesLinkTask,
} from "./document-property-filters.ts";

describe("document property filters", () => {
  it("normalizes camelCase to kebab-case", () => {
    assert.equal(camelToKebab("houseRule"), "house-rule");
    assert.deepEqual(parseMultiQueryValues("houseRule,runbook"), [
      "house-rule",
      "runbook",
    ]);
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
  });
});
