import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPowerSyncUrl,
  preferLocalPowerSyncEndpoint,
} from "./powersync-auth.js";

describe("preferLocalPowerSyncEndpoint", () => {
  it("detects Tauri and local Vite origins", () => {
    assert.equal(
      preferLocalPowerSyncEndpoint({ origin: "tauri://localhost" }),
      true,
    );
    assert.equal(
      preferLocalPowerSyncEndpoint({ origin: "https://tauri.localhost" }),
      true,
    );
    assert.equal(
      preferLocalPowerSyncEndpoint({ origin: "http://localhost:1420" }),
      true,
    );
    assert.equal(
      preferLocalPowerSyncEndpoint({ origin: "http://127.0.0.1:1420" }),
      true,
    );
  });

  it("detects loopback Host (desktop → local core)", () => {
    assert.equal(
      preferLocalPowerSyncEndpoint({ host: "127.0.0.1:8788" }),
      true,
    );
    assert.equal(preferLocalPowerSyncEndpoint({ host: "localhost:8788" }), true);
  });

  it("leaves Tailscale / LAN clients on the public endpoint", () => {
    assert.equal(
      preferLocalPowerSyncEndpoint({
        host: "macbook.tailc7e057.ts.net:8788",
        origin: null,
      }),
      false,
    );
  });
});

describe("getPowerSyncUrl", () => {
  it("returns loopback for desktop even when POWERSYNC_URL is Tailscale", () => {
    const previous = process.env.POWERSYNC_URL;
    process.env.POWERSYNC_URL = "http://macbook.tailc7e057.ts.net:8080";
    delete process.env.POWERSYNC_LOCAL_URL;
    try {
      assert.equal(
        getPowerSyncUrl({ host: "127.0.0.1:8788" }),
        "http://127.0.0.1:8080",
      );
      assert.equal(
        getPowerSyncUrl({ host: "macbook.tailc7e057.ts.net:8788" }),
        "http://macbook.tailc7e057.ts.net:8080",
      );
    } finally {
      if (previous === undefined) delete process.env.POWERSYNC_URL;
      else process.env.POWERSYNC_URL = previous;
    }
  });
});
