import { createRequire } from "node:module";

const requireExpoCrypto = createRequire(import.meta.url);

/**
 * UUID v4 for React Native. Hermes does not expose `globalThis.crypto`, so
 * bare `crypto.randomUUID()` throws ("Property 'crypto' doesn't exist").
 */
export function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return requireExpoCrypto("expo-crypto").randomUUID() as string;
}

/** UUID without hyphens — PowerSync / SQLite row ids. */
export function randomUuidCompact(): string {
  return randomUuid().replace(/-/g, "");
}
