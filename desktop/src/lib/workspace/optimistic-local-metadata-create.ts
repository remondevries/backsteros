import type { BacksterosApiClient } from "@backsteros/api-client";

import type { WorkspacePowerSync } from "./workspace-data-types";
import { resolveEntityNumberAfterLocalCreate } from "./resolve-entity-number-after-local-create";

type ApiRowsSetter<T> = (
  updater: (rows: T[] | null) => T[] | null,
) => void;

export type OptimisticLocalMetadataCreateInput = {
  id: string;
  applyOptimistic: () => void;
  rollback: () => void;
  createMetadata: () => Promise<void>;
  errorLabel: string;
  afterCreate?: () => Promise<void>;
  resolveNumberAfterUpload?: {
    client: BacksterosApiClient;
    powerSync: WorkspacePowerSync;
    fetchPath: string;
    setters: Array<ApiRowsSetter<{ id: string; number?: number | null }>>;
  };
};

/**
 * Shared local-first create: optimistic API cache → PowerSync insert → optional
 * flush + number resolution. Rolls back cache on insert failure.
 */
export async function optimisticLocalMetadataCreate(
  input: OptimisticLocalMetadataCreateInput,
): Promise<{ id: string; number: number | null }> {
  input.applyOptimistic();
  try {
    await input.createMetadata();
  } catch (error) {
    input.rollback();
    console.warn(`[desktop] ${input.errorLabel} failed`, error);
    throw error instanceof Error ? error : new Error(input.errorLabel);
  }

  if (!input.resolveNumberAfterUpload) {
    if (input.afterCreate) {
      await input.afterCreate();
    }
    return { id: input.id, number: null };
  }

  const { client, powerSync, fetchPath, setters } =
    input.resolveNumberAfterUpload;
  const number = await resolveEntityNumberAfterLocalCreate(
    client,
    powerSync,
    fetchPath,
    input.id,
    ...setters,
  );
  if (input.afterCreate) {
    await input.afterCreate();
  }
  return { id: input.id, number };
}
