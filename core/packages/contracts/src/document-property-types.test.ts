import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  agentMustProposeDocumentPropertyTypes,
  CORE_DOCUMENT_PROPERTY_TYPE_SEEDS,
  isDocumentPropertyTypeKey,
  isReservedDocumentPropertyKey,
  validateDocumentPropertyValue,
} from "./document-property-types.ts";

describe("document property type keys", () => {
  it("accepts English camelCase", () => {
    assert.equal(isDocumentPropertyTypeKey("reviewDate"), true);
    assert.equal(isDocumentPropertyTypeKey("type"), true);
    assert.equal(isDocumentPropertyTypeKey("house-rule"), false);
    assert.equal(isDocumentPropertyTypeKey("Type"), false);
  });

  it("reserves docKey", () => {
    assert.equal(isReservedDocumentPropertyKey("docKey"), true);
    assert.equal(isReservedDocumentPropertyKey("type"), false);
  });
});

describe("agent property type gate", () => {
  it("lets the owner shell mutate types", () => {
    assert.equal(
      agentMustProposeDocumentPropertyTypes({ kind: "local_shell" }),
      false,
    );
  });

  it("lets a workspace-owner API key mutate types", () => {
    assert.equal(
      agentMustProposeDocumentPropertyTypes({
        kind: "api_key",
        contactId: "c1",
        isWorkspaceOwnerKey: true,
      }),
      false,
    );
  });

  it("forces contact-bound agent keys to propose", () => {
    assert.equal(
      agentMustProposeDocumentPropertyTypes({
        kind: "api_key",
        contactId: "agent-contact",
        isWorkspaceOwnerKey: false,
      }),
      true,
    );
  });
});

describe("property value validation", () => {
  const typeOptions = CORE_DOCUMENT_PROPERTY_TYPE_SEEDS.find(
    (seed) => seed.key === "type",
  )!.options!;

  it("accepts core select values and rejects unknown options", () => {
    assert.equal(
      validateDocumentPropertyValue({
        key: "type",
        kind: "select",
        value: "house-rule",
        options: typeOptions,
      }).ok,
      true,
    );
    assert.equal(
      validateDocumentPropertyValue({
        key: "type",
        kind: "select",
        value: "not-a-type",
        options: typeOptions,
      }).ok,
      false,
    );
  });

  it("treats null as removal", () => {
    const result = validateDocumentPropertyValue({
      key: "status",
      kind: "select",
      value: null,
      options: [],
    });
    assert.deepEqual(result, { ok: true, value: null });
  });

  it("normalizes multi contact/task lists", () => {
    const result = validateDocumentPropertyValue({
      key: "linkedTasks",
      kind: "task",
      value: "OS-1, OS-2",
      multiple: true,
    });
    assert.deepEqual(result, { ok: true, value: ["OS-1", "OS-2"] });
    const list = validateDocumentPropertyValue({
      key: "linkedTasks",
      kind: "task",
      value: ["OS-1", "OS-2"],
      multiple: true,
    });
    assert.deepEqual(list, { ok: true, value: ["OS-1", "OS-2"] });
  });
});
