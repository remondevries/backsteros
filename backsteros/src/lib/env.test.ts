import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_CORE_API_URL,
  CLOUD_SYNC_URL,
  LOCAL_CORE_API_URL,
  isLocalDevApiUrl,
  readViteOrProcessEnv,
  resolveDesktopApiUrl,
  rewritePowerSyncEndpoint,
  sseUrlForApiUrl,
} from "./env.ts";

test("product API defaults to local-core", () => {
  assert.equal(resolveDesktopApiUrl(undefined), LOCAL_CORE_API_URL);
  assert.equal(resolveDesktopApiUrl(""), "http://127.0.0.1:8788");
  assert.equal(
    resolveDesktopApiUrl("http://100.75.45.22:8788"),
    "https://api.local.backsteros.com",
  );
  assert.equal(
    resolveDesktopApiUrl("https://api.local.backsteros.com"),
    "https://api.local.backsteros.com",
  );
  assert.equal(
    resolveDesktopApiUrl("http://127.0.0.1:8788"),
    "http://127.0.0.1:8788",
  );
});

test("VITE_TREAT_API_AS_LOCAL_CORE keeps Tailscale local-core cleartext", () => {
  const previous = process.env.VITE_TREAT_API_AS_LOCAL_CORE;
  const previousHost = process.env.VITE_DEV_SERVER_HOST;
  process.env.VITE_TREAT_API_AS_LOCAL_CORE = "1";
  delete process.env.VITE_DEV_SERVER_HOST;
  try {
    assert.equal(
      resolveDesktopApiUrl("http://100.126.31.97:8788"),
      "http://100.126.31.97:8788",
    );
    assert.equal(isLocalDevApiUrl("http://100.126.31.97:8788"), true);
    assert.equal(isLocalDevApiUrl("http://development:8788"), true);
    assert.equal(
      rewritePowerSyncEndpoint("http://100.126.31.97:8080", {
        apiUrl: "http://100.126.31.97:8788",
      }),
      "http://100.126.31.97:8080",
    );
  } finally {
    if (previous === undefined) delete process.env.VITE_TREAT_API_AS_LOCAL_CORE;
    else process.env.VITE_TREAT_API_AS_LOCAL_CORE = previous;
    if (previousHost === undefined) delete process.env.VITE_DEV_SERVER_HOST;
    else process.env.VITE_DEV_SERVER_HOST = previousHost;
  }
});

test("VITE_DEV_SERVER_HOST HTTPS gateway is local-core when opted in", () => {
  const previousFlag = process.env.VITE_TREAT_API_AS_LOCAL_CORE;
  const previousHost = process.env.VITE_DEV_SERVER_HOST;
  process.env.VITE_TREAT_API_AS_LOCAL_CORE = "1";
  process.env.VITE_DEV_SERVER_HOST = "dev-os.lemo-design.com";
  try {
    assert.equal(
      isLocalDevApiUrl("https://dev-os.lemo-design.com"),
      true,
    );
    assert.equal(
      isLocalDevApiUrl("https://dev-os.lemo-design.com/"),
      true,
    );
    assert.equal(
      rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
        apiUrl: "https://dev-os.lemo-design.com",
      }),
      "https://dev-os.lemo-design.com/powersync",
    );
    assert.equal(
      rewritePowerSyncEndpoint("https://dev-os.lemo-design.com/powersync", {
        apiUrl: "https://dev-os.lemo-design.com",
      }),
      "https://dev-os.lemo-design.com/powersync",
    );
  } finally {
    if (previousFlag === undefined) delete process.env.VITE_TREAT_API_AS_LOCAL_CORE;
    else process.env.VITE_TREAT_API_AS_LOCAL_CORE = previousFlag;
    if (previousHost === undefined) delete process.env.VITE_DEV_SERVER_HOST;
    else process.env.VITE_DEV_SERVER_HOST = previousHost;
  }
});

test("without treat flag, HTTPS gateway host is not local-core", () => {
  const previousFlag = process.env.VITE_TREAT_API_AS_LOCAL_CORE;
  const previousHost = process.env.VITE_DEV_SERVER_HOST;
  delete process.env.VITE_TREAT_API_AS_LOCAL_CORE;
  process.env.VITE_DEV_SERVER_HOST = "dev-os.lemo-design.com";
  try {
    assert.equal(isLocalDevApiUrl("https://dev-os.lemo-design.com"), false);
    assert.equal(
      resolveDesktopApiUrl("http://100.75.45.22:8788"),
      CLOUD_CORE_API_URL,
    );
  } finally {
    if (previousFlag === undefined) delete process.env.VITE_TREAT_API_AS_LOCAL_CORE;
    else process.env.VITE_TREAT_API_AS_LOCAL_CORE = previousFlag;
    if (previousHost === undefined) delete process.env.VITE_DEV_SERVER_HOST;
    else process.env.VITE_DEV_SERVER_HOST = previousHost;
  }
});

test("cleartext PowerSync stays loopback for local-core API", () => {
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
      apiUrl: LOCAL_CORE_API_URL,
    }),
    "http://127.0.0.1:8080",
  );
  assert.equal(
    rewritePowerSyncEndpoint("http://100.75.45.22:8080", {
      apiUrl: CLOUD_CORE_API_URL,
    }),
    CLOUD_SYNC_URL,
  );
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
      apiUrl: CLOUD_CORE_API_URL,
    }),
    CLOUD_SYNC_URL,
  );
  assert.equal(
    rewritePowerSyncEndpoint("https://sync.local.backsteros.com"),
    "https://sync.local.backsteros.com",
  );
});

test("optional replica API splits loopback REST vs SSE hosts", () => {
  assert.equal(isLocalDevApiUrl("http://127.0.0.1:8788"), true);
  assert.equal(isLocalDevApiUrl("http://localhost:8788"), true);
  assert.equal(isLocalDevApiUrl("http://localhost:1420"), false);
  assert.equal(isLocalDevApiUrl("https://api.local.backsteros.com"), false);
  assert.equal(
    rewritePowerSyncEndpoint("http://127.0.0.1:8080", {
      apiUrl: "http://127.0.0.1:8788",
    }),
    "http://127.0.0.1:8080",
  );
  assert.equal(
    sseUrlForApiUrl("http://127.0.0.1:8788"),
    "http://localhost:8788",
  );
  assert.equal(
    sseUrlForApiUrl("http://localhost:8788"),
    "http://127.0.0.1:8788",
  );
  assert.equal(
    sseUrlForApiUrl("https://api.local.backsteros.com"),
    "https://sse.local.backsteros.com",
  );
});

test("readViteOrProcessEnv does not throw when process is undefined", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "process");
  // Browser-like: no Node `process` (OS-148 fallback must not ReferenceError).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).process;
  try {
    assert.doesNotThrow(() =>
      readViteOrProcessEnv("VITE_TREAT_API_AS_LOCAL_CORE_MISSING"),
    );
    assert.equal(
      readViteOrProcessEnv("VITE_TREAT_API_AS_LOCAL_CORE_MISSING"),
      undefined,
    );
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "process", previous);
    }
  }
});
