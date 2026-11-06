/**
 * Shell agent chat transport: local-core (local-shell) when the product API is
 * the loopback core, otherwise the agents-door / `__cloud_core__` proxy.
 *
 * Local OS-167 preview seeds live on :8788 — cloud 401 must not block opening
 * those threads.
 */

import type { BacksterosApiClient } from "@backsteros/api-client";

import {
  cloudCoreRequestBlob,
  cloudCoreRequestJson,
  cloudCoreRequestStream,
} from "./cloud-core-api";
import { isLocalDevApiUrl } from "./env";

export function shellChatUsesLocalCore(apiUrl: string): boolean {
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
