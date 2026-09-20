import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  DEFAULT_BACKSTEROS_API_URL,
  DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
  formatBacksterosLocalCoreError,
  isBacksterosApiProxyUrl,
  isBacksterosLocalCorePath,
  normalizePersistedBacksterosApiUrl,
  normalizePersistedBacksterosLocalCoreUrl,
} from "./backsterosApiProxy";

describe("isBacksterosApiProxyUrl", () => {
  it("treats the local sentinel as proxy-eligible", () => {
    assert.equal(isBacksterosApiProxyUrl("http://127.0.0.1:8788"), true);
    assert.equal(isBacksterosApiProxyUrl("http://localhost:8788/"), true);
  });

  it("treats the Mac HTTPS gateway as proxy-eligible", () => {
    assert.equal(isBacksterosApiProxyUrl("https://api.local.backsteros.com"), true);
    assert.equal(isBacksterosApiProxyUrl("https://api.local.backsteros.com/"), true);
  });

  it("rejects unrelated hosts", () => {
    assert.equal(isBacksterosApiProxyUrl("https://example.com"), false);
    assert.equal(isBacksterosApiProxyUrl("http://127.0.0.1:3000"), false);
  });
});

describe("normalizePersistedBacksterosApiUrl", () => {
  it("rewrites the gateway to the local proxy sentinel", () => {
    assert.equal(
      normalizePersistedBacksterosApiUrl("https://api.local.backsteros.com"),
      DEFAULT_BACKSTEROS_API_URL,
    );
  });

  it("keeps an explicit local sentinel", () => {
    assert.equal(
      normalizePersistedBacksterosApiUrl("http://127.0.0.1:8788"),
      "http://127.0.0.1:8788",
    );
  });

  it("keeps a cloud product API URL", () => {
    assert.equal(
      normalizePersistedBacksterosApiUrl("https://agent.backsteros.com"),
      "https://agent.backsteros.com",
    );
  });
});

describe("normalizePersistedBacksterosLocalCoreUrl", () => {
  it("defaults empty to local-core loopback", () => {
    assert.equal(normalizePersistedBacksterosLocalCoreUrl(""), DEFAULT_BACKSTEROS_LOCAL_CORE_URL);
  });

  it("rewrites the Mac gateway to the local-core sentinel", () => {
    assert.equal(
      normalizePersistedBacksterosLocalCoreUrl("https://api.local.backsteros.com"),
      DEFAULT_BACKSTEROS_LOCAL_CORE_URL,
    );
  });
});

describe("isBacksterosLocalCorePath", () => {
  it("matches project FS and docs routes", () => {
    assert.equal(
      isBacksterosLocalCorePath("/api/v1/projects/abc/fs/entries"),
      true,
    );
    assert.equal(
      isBacksterosLocalCorePath("/api/v1/projects/abc/fs/file?path=docs/x.md"),
      true,
    );
    assert.equal(isBacksterosLocalCorePath("/api/v1/projects/abc/docs"), true);
  });

  it("rejects product / GitHub routes", () => {
    assert.equal(isBacksterosLocalCorePath("/api/v1/projects?type=codebase"), false);
    assert.equal(isBacksterosLocalCorePath("/api/v1/projects/abc/github/commits"), false);
    assert.equal(isBacksterosLocalCorePath("/api/v1/tasks"), false);
    assert.equal(isBacksterosLocalCorePath("/api/v1/project-updates"), false);
  });
});

describe("formatBacksterosLocalCoreError", () => {
  it("explains missing working directory on this host", () => {
    const message = formatBacksterosLocalCoreError(
      new Error("Working directory was not found on this host"),
    );
    assert.match(message, /local-core/i);
    assert.match(message, /working directory/i);
  });

  it("explains unreachable local-core", () => {
    const message = formatBacksterosLocalCoreError(new Error("BacksterOS is unreachable"));
    assert.match(message, /unreachable/i);
  });
});
