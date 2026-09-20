import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canManageApiKeys,
  canMintPowerSyncToken,
  getPowerSyncUrl,
  isDesktopShellOrigin,
  isDevGatewayOrigin,
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

  it("treats the dev gateway as a remote client", () => {
    assert.equal(
      isDevGatewayOrigin("https://os.local.backsteros.com"),
      true,
    );
    assert.equal(
      preferLocalPowerSyncEndpoint({
        origin: "https://os.local.backsteros.com",
        host: "api.local.backsteros.com",
      }),
      false,
    );
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
  it("returns loopback for desktop on local-core even when POWERSYNC_URL is Tailscale", () => {
    const previousUrl = process.env.POWERSYNC_URL;
    const previousRole = process.env.CORE_REPLICATION_ROLE;
    process.env.POWERSYNC_URL = "http://macbook.tailc7e057.ts.net:8080";
    process.env.CORE_REPLICATION_ROLE = "local";
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
      assert.equal(
        getPowerSyncUrl({
          origin: "https://os.local.backsteros.com",
          host: "api.local.backsteros.com",
        }),
        "https://sync.local.backsteros.com",
      );
    } finally {
      if (previousUrl === undefined) delete process.env.POWERSYNC_URL;
      else process.env.POWERSYNC_URL = previousUrl;
      if (previousRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
      else process.env.CORE_REPLICATION_ROLE = previousRole;
    }
  });

  it("returns the cloud sync URL for Tauri when this process is cloud-core", () => {
    const previousUrl = process.env.POWERSYNC_URL;
    const previousRole = process.env.CORE_REPLICATION_ROLE;
    process.env.POWERSYNC_URL = "http://100.75.45.22:8080";
    process.env.CORE_REPLICATION_ROLE = "cloud";
    try {
      assert.equal(isDesktopShellOrigin("http://localhost:1420"), true);
      assert.equal(
        getPowerSyncUrl({
          origin: "http://localhost:1420",
          host: "100.75.45.22:8788",
        }),
        "http://100.75.45.22:8080",
      );
      assert.equal(
        getPowerSyncUrl({ origin: "tauri://localhost" }),
        "http://100.75.45.22:8080",
      );
    } finally {
      if (previousUrl === undefined) delete process.env.POWERSYNC_URL;
      else process.env.POWERSYNC_URL = previousUrl;
      if (previousRole === undefined) delete process.env.CORE_REPLICATION_ROLE;
      else process.env.CORE_REPLICATION_ROLE = previousRole;
    }
  });
});

describe("canMintPowerSyncToken", () => {
  it("allows local-shell and owner API keys, not portal keys", () => {
    assert.equal(
      canMintPowerSyncToken({
        kind: "local_shell",
        userId: "user-1",
        clerkUserId: "local_shell",
        apiKeyId: null,
        contactId: null,
        workspaceId: "ws",
        membershipRole: "owner",
        scopes: [],
      }),
      true,
    );
    assert.equal(
      canMintPowerSyncToken({
        kind: "api_key",
        userId: "user-1",
        clerkUserId: null,
        apiKeyId: "key-1",
        contactId: "contact-1",
        workspaceId: "ws",
        membershipRole: null,
        scopes: ["settings:write", "tasks:write", "tasks:read"],
      }),
      true,
    );
    assert.equal(
      canMintPowerSyncToken({
        kind: "api_key",
        userId: "user-1",
        clerkUserId: null,
        apiKeyId: "key-1",
        contactId: "contact-1",
        workspaceId: "ws",
        membershipRole: null,
        scopes: ["tasks:read"],
      }),
      false,
    );
  });
});

describe("canManageApiKeys", () => {
  it("allows local_shell and owner api_key with settings:write", () => {
    assert.equal(
      canManageApiKeys({
        kind: "local_shell",
        userId: "user-1",
        clerkUserId: "local_shell",
        apiKeyId: null,
        contactId: null,
        workspaceId: "ws",
        membershipRole: "owner",
        scopes: [],
      }),
      true,
    );
    assert.equal(
      canManageApiKeys({
        kind: "api_key",
        userId: "user-1",
        clerkUserId: null,
        apiKeyId: "key-1",
        contactId: null,
        workspaceId: "ws",
        membershipRole: null,
        scopes: ["settings:write", "tasks:write"],
      }),
      true,
    );
  });

  it("rejects contact-bound agent keys even when overscoped", () => {
    assert.equal(
      canManageApiKeys({
        kind: "api_key",
        userId: "user-1",
        clerkUserId: null,
        apiKeyId: "key-1",
        contactId: "contact-1",
        workspaceId: "ws",
        membershipRole: null,
        scopes: ["settings:write", "tasks:write", "tasks:read"],
      }),
      false,
    );
  });

  it("rejects api keys without settings:write", () => {
    assert.equal(
      canManageApiKeys({
        kind: "api_key",
        userId: "user-1",
        clerkUserId: null,
        apiKeyId: "key-1",
        contactId: null,
        workspaceId: "ws",
        membershipRole: null,
        scopes: ["tasks:write", "tasks:read"],
      }),
      false,
    );
  });
});
