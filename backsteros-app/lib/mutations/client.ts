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

/** Seed PowerSync metadata after an API-first document create (storage lives in S3). */
export async function seedDocumentLocal(
  sync: MutationSync | null,
  document: {
    id: string;
    type: string;
    projectId?: string | null;
    parentId?: string | null;
    kind?: string | null;
    icon?: string | null;
    sortOrder?: number | null;
    journalDate?: string | null;
    path: string;
    title: string;
    storageKey?: string | null;
    contentType?: string | null;
    byteSize?: number | null;
    checksum?: string | null;
    snippet?: string | null;
    contentVersion?: number | null;
    contentEtag?: string | null;
  },
) {
  if (!sync?.ready) return;
  try {
    await sync.createMetadata(
      "documents",
      toLocalFields({
        type: document.type,
        projectId: document.projectId ?? null,
        parentId: document.parentId ?? null,
        kind: document.kind ?? "document",
        icon: document.icon ?? null,
        sortOrder: document.sortOrder ?? 0,
        journalDate: document.journalDate ?? null,
        path: document.path,
        title: document.title,
        storageKey: document.storageKey ?? "",
        contentType: document.contentType ?? "text/markdown",
        byteSize: document.byteSize ?? 0,
        checksum: document.checksum ?? null,
        snippet: document.snippet ?? null,
        contentVersion: document.contentVersion ?? 1,
        contentEtag: document.contentEtag ?? null,
      }),
      document.id,
    );
  } catch {
    // Non-fatal: download sync will eventually bring the row in.
  }
}
