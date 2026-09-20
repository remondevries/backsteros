type ExpoCryptoModule = typeof import("expo-crypto");

function loadExpoCrypto(): ExpoCryptoModule {
  // Lazy require — Hermes has no `crypto`; Node tests use globalThis.crypto instead.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-crypto") as ExpoCryptoModule;
}

/**
 * UUID v4 for React Native. Hermes does not expose `globalThis.crypto`, so
 * bare `crypto.randomUUID()` throws ("Property 'crypto' doesn't exist").
 */
export function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return loadExpoCrypto().randomUUID();
}

/** UUID without hyphens — PowerSync / SQLite row ids. */
export function randomUuidCompact(): string {
  return randomUuid().replace(/-/g, "");
}
