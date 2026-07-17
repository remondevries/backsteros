"use client";

import type { BacksterosApiClient } from "@backsteros/api-client";

import type { SyncedMetadataTable } from "@/lib/powersync-context";

export type MutationSync = {
  ready: boolean;
  createMetadata: (
    table: SyncedMetadataTable,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<string>;
  patchMetadata: (
    table: SyncedMetadataTable,
    id: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
};

export type MutationContext = {
  client: BacksterosApiClient;
  sync: MutationSync | null;
  refresh: () => void;
};

let context: MutationContext | null = null;

export function setMutationContext(next: MutationContext | null) {
  context = next;
}

export function getMutationContext(): MutationContext {
  if (!context) {
    throw new Error(
      "Mutation context is not ready. Ensure MutationProvider is mounted.",
    );
  }
  return context;
}

export function toLocalFields(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      value === true ? 1 : value === false ? 0 : value,
    ]),
  );
}

export function apiErrorText(error: unknown, fallback = "Request failed.") {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message.trim();
  if (
    message === "Failed to fetch" ||
    message === "NetworkError when attempting to fetch resource." ||
    message === "Load failed" ||
    error.name === "NetworkError"
  ) {
    return "Could not reach the API. Check that the backend is running.";
  }

  return message || fallback;
}

export async function patchTaskLocal(
  sync: MutationSync | null,
  taskId: string,
  values: Record<string, unknown>,
) {
  if (sync?.ready) {
    await sync.patchMetadata("tasks", taskId, toLocalFields(values));
  }
}

export async function patchProjectLocal(
  sync: MutationSync | null,
  projectId: string,
  values: Record<string, unknown>,
) {
  if (sync?.ready) {
    await sync.patchMetadata("projects", projectId, toLocalFields(values));
  }
}

export async function patchContactLocal(
  sync: MutationSync | null,
  contactId: string,
  values: Record<string, unknown>,
) {
  if (sync?.ready) {
    await sync.patchMetadata("contacts", contactId, toLocalFields(values));
  }
}

export async function patchOrganizationLocal(
  sync: MutationSync | null,
  organizationId: string,
  values: Record<string, unknown>,
) {
  if (sync?.ready) {
    await sync.patchMetadata(
      "organizations",
      organizationId,
      toLocalFields(values),
    );
  }
}

export async function patchLetterLocal(
  sync: MutationSync | null,
  letterId: string,
  values: Record<string, unknown>,
) {
  if (sync?.ready) {
    await sync.patchMetadata("letters", letterId, toLocalFields(values));
  }
}

export async function patchDocumentLocal(
  sync: MutationSync | null,
  documentId: string,
  values: Record<string, unknown>,
) {
  if (sync?.ready) {
    await sync.patchMetadata("documents", documentId, toLocalFields(values));
  }
}
