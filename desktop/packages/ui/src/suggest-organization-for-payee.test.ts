import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { suggestOrganizationForPayee } from "./suggest-organization-for-payee.js";

describe("suggestOrganizationForPayee", () => {
  const orgs = [
    { id: "1", name: "Albert Heijn", key: "ah" },
    { id: "2", name: "Reset4U", key: "reset" },
  ];

  it("matches payee containing organization name", () => {
    const match = suggestOrganizationForPayee(
      "Albert Heijn 1513 Amsterdam",
      null,
      orgs,
    );
    assert.equal(match?.id, "1");
  });

  it("returns null for weak matches", () => {
    const match = suggestOrganizationForPayee("xx", null, orgs);
    assert.equal(match, null);
  });
});
