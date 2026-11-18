/**
 * Shell agent chat transport: cloud agents-door by default; local-core only
 * when explicitly opted in for OS-167 Ralph SIMULATION / payment-proposal
 * preview seeds (`VITE_SHELL_CHAT_USE_LOCAL_CORE`).
 *
 * Production desktop uses loopback `apiUrl` (:8788) for product REST, but
 * `chat_threads` are not replicated — agent replies go to the public cloud
 * door. Loopback alone must not select local chat transport (OS-192).
 */

import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  cloudCoreRequestBlob,
  cloudCoreRequestJson,
  cloudCoreRequestStream,
} from "./cloud-core-api";
import { isLocalDevApiUrl, readViteOrProcessEnv } from "./env";

/**
 * Explicit OS-167 sim/preview opt-in. Production packaged desktop never sets
 * this — loopback `VITE_API_URL` alone is not enough.
 */
export function isShellChatLocalCoreOptIn(): boolean {
  const normalized = readViteOrProcessEnv(
    "VITE_SHELL_CHAT_USE_LOCAL_CORE",
  )?.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * True only for the explicit local sim/preview case: opt-in flag + local-core
 * product API. Production loopback apiUrl → false (cloud transport).
 */
export function shellChatUsesLocalCore(apiUrl: string): boolean {
  if (!isShellChatLocalCoreOptIn()) return false;
  return isLocalDevApiUrl(apiUrl);
}

export async function shellChatRequestJson<T>(
  apiUrl: string,
  client: BacksterosApiClient,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (shellChatUsesLocalCore(apiUrl)) {
    return client.requestJson<T>(path, init);
  }
  return cloudCoreRequestJson<T>(path, init);
}

export async function shellChatRequestBlob(
  apiUrl: string,
  client: BacksterosApiClient,
  path: string,
): Promise<Blob> {
  if (shellChatUsesLocalCore(apiUrl)) {
    return client.requestBinary(path);
  }
  return cloudCoreRequestBlob(path);
}

export function shellChatRequestStream(
  apiUrl: string,
  client: BacksterosApiClient,
): (path: string, init?: RequestInit) => Promise<Response> {
  if (shellChatUsesLocalCore(apiUrl)) {
    return (path, init) => client.requestStream(path, init);
  }
  return cloudCoreRequestStream;
}
