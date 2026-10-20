import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adoptRemoteField,
  adoptRemoteKeyedField,
} from "./adopt-remote-field.js";

describe("adoptRemoteField", () => {
  it("adopts when local still matches the prior source", () => {
    let local = "Alice";
    let source = "Alice";
    adoptRemoteField(
      "Bob",
      local,
      source,
      (next) => {
        local = next;
      },
      (next) => {
        source = next;
      },
    );
    assert.equal(local, "Bob");
    assert.equal(source, "Bob");
  });

  it("updates source but keeps dirty local", () => {
    let local = "Carol";
    let source = "Alice";
    adoptRemoteField(
      "Bob",
      local,
      source,
      (next) => {
        local = next;
      },
      (next) => {
        source = next;
      },
    );
    assert.equal(local, "Carol");
    assert.equal(source, "Bob");
  });
});

describe("adoptRemoteKeyedField", () => {
  it("ignores remote flaps while pending", () => {
    let local = '["nl"]';
    let source = "[]";
    let pending: string | null = '["nl"]';
    let adopted = false;

    adoptRemoteKeyedField({
      remoteKey: "[]",
      localKey: local,
      sourceKey: source,
      pendingKey: pending,
      setSource: (next) => {
        source = next;
      },
      setLocalFromRemote: () => {
        adopted = true;
        local = "[]";
      },
      clearPending: () => {
        pending = null;
      },
    });

    assert.equal(pending, '["nl"]');
    assert.equal(local, '["nl"]');
    assert.equal(source, "[]");
    assert.equal(adopted, false);
  });

  it("clears pending and adopts when remote matches", () => {
    let local = '["nl"]';
    let source = "[]";
    let pending: string | null = '["nl"]';

    adoptRemoteKeyedField({
      remoteKey: '["nl"]',
      localKey: local,
      sourceKey: source,
      pendingKey: pending,
      setSource: (next) => {
        source = next;
      },
      setLocalFromRemote: () => {
        local = '["nl"]';
      },
      clearPending: () => {
        pending = null;
      },
    });

    assert.equal(pending, null);
    assert.equal(source, '["nl"]');
    assert.equal(local, '["nl"]');
  });

  it("adopts clean local when not pending", () => {
    let local = "[]";
    let source = "[]";
    let pending: string | null = null;

    adoptRemoteKeyedField({
      remoteKey: '["en"]',
      localKey: local,
      sourceKey: source,
      pendingKey: pending,
      setSource: (next) => {
        source = next;
      },
      setLocalFromRemote: () => {
        local = '["en"]';
      },
      clearPending: () => {
        pending = null;
      },
    });

    assert.equal(local, '["en"]');
    assert.equal(source, '["en"]');
  });
});
