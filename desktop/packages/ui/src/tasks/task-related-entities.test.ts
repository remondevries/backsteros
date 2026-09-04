import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildTaskRelatedDropdownOptions,
  decodeTaskRelatedValues,
  encodeTaskRelatedValues,
  formatTaskRelatedSelectionLabel,
} from "./task-related-entities.js";

describe("task-related-entities", () => {
  it("encodes and decodes contact + organization ids", () => {
    const values = encodeTaskRelatedValues(["c1", "c2"], ["o1"]);
    assert.deepEqual(values, [
      "contact:c1",
      "contact:c2",
      "organization:o1",
    ]);
    assert.deepEqual(decodeTaskRelatedValues(values), {
      contactIds: ["c1", "c2"],
      organizationIds: ["o1"],
    });
  });

  it("builds prefixed options with contact and org icons preserved", () => {
    const options = buildTaskRelatedDropdownOptions({
      contactOptions: [
        { value: "__none__", label: "Unassigned" },
        { value: "c1", label: "Ada", icon: "person" },
      ],
      organizationOptions: [
        { value: "__none__", label: "No organization" },
        { value: "o1", label: "Acme", icon: "org" },
      ],
    });
    assert.deepEqual(options, [
      {
        value: "contact:c1",
        label: "Ada",
        icon: "person",
        searchTerms: "contact Ada",
      },
      {
        value: "organization:o1",
        label: "Acme",
        icon: "org",
        searchTerms: "organization org Acme",
      },
    ]);
  });

  it("formats selection labels", () => {
    const options = [
      { value: "contact:c1", label: "Ada" },
      { value: "organization:o1", label: "Acme" },
    ];
    assert.equal(
      formatTaskRelatedSelectionLabel({
        values: [],
        options,
        emptyLabel: "No related",
      }),
      "No related",
    );
    assert.equal(
      formatTaskRelatedSelectionLabel({
        values: ["contact:c1"],
        options,
        emptyLabel: "No related",
      }),
      "Ada",
    );
    assert.equal(
      formatTaskRelatedSelectionLabel({
        values: ["contact:c1", "organization:o1"],
        options,
        emptyLabel: "No related",
      }),
      "2 related",
    );
  });
});
