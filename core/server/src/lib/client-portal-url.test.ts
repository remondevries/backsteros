import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  DEFAULT_CLIENT_PORTAL_URL,
  resolveClientPortalBaseUrl,
} from "./client-portal-url.js";

const ENV_KEYS = ["CLIENT_PORTAL_URL", "PORTAL_PUBLIC_URL"] as const;

describe("resolveClientPortalBaseUrl", () => {
  const previous = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      previous.delete(key);
    }
  });

  function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("defaults to the public client portal", () => {
    setEnv("CLIENT_PORTAL_URL", undefined);
    setEnv("PORTAL_PUBLIC_URL", undefined);
    assert.equal(resolveClientPortalBaseUrl(), DEFAULT_CLIENT_PORTAL_URL);
  });

  it("uses CLIENT_PORTAL_URL when it is a public host", () => {
    setEnv("CLIENT_PORTAL_URL", "https://client-staging.lemo-design.com/");
    assert.equal(
      resolveClientPortalBaseUrl(),
      "https://client-staging.lemo-design.com",
    );
  });

  it("ignores localhost CLIENT_PORTAL_URL", () => {
    setEnv("CLIENT_PORTAL_URL", "http://localhost:3000");
    assert.equal(resolveClientPortalBaseUrl(), DEFAULT_CLIENT_PORTAL_URL);
  });

  it("ignores 127.0.0.1 CLIENT_PORTAL_URL", () => {
    setEnv("CLIENT_PORTAL_URL", "http://127.0.0.1:3000");
    assert.equal(resolveClientPortalBaseUrl(), DEFAULT_CLIENT_PORTAL_URL);
  });
});
