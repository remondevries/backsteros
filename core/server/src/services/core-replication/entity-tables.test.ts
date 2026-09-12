import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  replicatedTablesForEntity,
  replicatedTablesForEntities,
} from "./entity-tables.js";

describe("replicatedTablesForEntity", () => {
  it("maps CRM entities to twin tables", () => {
    assert.deepEqual(replicatedTablesForEntity("crm_group"), ["crm_groups"]);
    assert.deepEqual(replicatedTablesForEntity("crm_group_member"), [
      "crm_group_members",
    ]);
  });

  it("dedupes across entities", () => {
    assert.deepEqual(
      replicatedTablesForEntities(["crm_group", "crm_group", "contact"]),
      ["crm_groups", "contacts"],
    );
  });

  it("returns empty for unknown entities", () => {
    assert.deepEqual(replicatedTablesForEntity("not_a_thing"), []);
    assert.deepEqual(replicatedTablesForEntity(null), []);
  });
});
