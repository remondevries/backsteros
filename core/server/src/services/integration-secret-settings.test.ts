import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createIntegrationSecretSettingsService,
  type IntegrationSecretState,
  type IntegrationSecretStore,
} from "./integration-secret-settings.js";

function memoryStore(initial: Record<string, string | null> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: Array<[string, string | null]> = [];
  const store: IntegrationSecretStore = {
    async read(workspaceId) {
      return values.get(workspaceId) ?? null;
    },
    async write(workspaceId, value) {
      writes.push([workspaceId, value]);
      values.set(workspaceId, value);
    },
  };
  return { store, writes };
}

function createService(
  store: IntegrationSecretStore,
  envValue: () => string | null = () => null,
) {
  const tested: Array<string | null> = [];
  const service = createIntegrationSecretSettingsService({
    store,
    patchKey: "apiToken",
    preview: (secret) => `${secret.slice(0, 3)}•••`,
    envFallback: envValue,
    toSettings: (state: IntegrationSecretState) => state,
    test: async (secret) => {
      tested.push(secret);
      return { ok: secret != null };
    },
  });
  return { service, tested };
}

test("getSettings masks the stored secret and reports configured", async () => {
  const { store } = memoryStore({ ws: "  tok_abcdef  " });
  const { service } = createService(store);
  assert.deepEqual(await service.getSettings("ws"), {
    configured: true,
    preview: "tok•••",
    envConfigured: false,
    connected: true,
  });
});

test("env fallback connects without counting as a workspace secret", async () => {
  const { store } = memoryStore();
  const { service, tested } = createService(store, () => " env_token ");
  assert.deepEqual(await service.getSettings("ws"), {
    configured: false,
    preview: null,
    envConfigured: true,
    connected: true,
  });
  assert.equal(await service.getWorkspaceSecret("ws"), null);
  assert.equal(await service.getSecret("ws"), "env_token");
  await service.testConnection("ws");
  assert.deepEqual(tested, ["env_token"]);
});

test("workspace secret wins over the env fallback", async () => {
  const { store } = memoryStore({ ws: "workspace_token" });
  const { service } = createService(store, () => "env_token");
  assert.equal(await service.getSecret("ws"), "workspace_token");
});

test("blank env values are not treated as configured", async () => {
  const { store } = memoryStore();
  const { service } = createService(store, () => "   ");
  const settings = await service.getSettings("ws");
  assert.equal(settings.envConfigured, false);
  assert.equal(settings.connected, false);
});

test("updateSettings trims, clears on blank, and skips absent keys", async () => {
  const { store, writes } = memoryStore();
  const { service } = createService(store);

  const saved = await service.updateSettings("ws", { apiToken: "  new_tok " });
  assert.equal(saved.configured, true);
  assert.equal(await service.getWorkspaceSecret("ws"), "new_tok");

  await service.updateSettings("ws", {});
  assert.equal(writes.length, 1);

  const cleared = await service.updateSettings("ws", { apiToken: "  " });
  assert.equal(cleared.configured, false);
  assert.deepEqual(writes.at(-1), ["ws", null]);
});
