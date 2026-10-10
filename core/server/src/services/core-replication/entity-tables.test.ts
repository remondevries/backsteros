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
      ["crm_groups", "contacts", "avatars"],
    );
  });

  it("maps contact/organization twin tables including avatars", () => {
    assert.deepEqual(replicatedTablesForEntity("contact"), [
      "contacts",
      "avatars",
    ]);
    assert.deepEqual(replicatedTablesForEntity("organization"), [
      "organizations",
      "avatars",
    ]);
    assert.deepEqual(replicatedTablesForEntity("api_key"), ["api_keys"]);
    assert.deepEqual(replicatedTablesForEntity("project_update"), [
      "project_updates",
    ]);
    assert.deepEqual(replicatedTablesForEntity("document_property_type"), [
      "document_property_types",
    ]);
    assert.deepEqual(replicatedTablesForEntity("task"), [
      "tasks",
      "task_images",
    ]);
    assert.deepEqual(replicatedTablesForEntity("task_comment"), [
      "task_comments",
      "task_activities",
      "task_images",
    ]);
  });

  it("returns empty for unknown entities", () => {
    assert.deepEqual(replicatedTablesForEntity("not_a_thing"), []);
    assert.deepEqual(replicatedTablesForEntity(null), []);
  });
});
