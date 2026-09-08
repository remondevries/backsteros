import type { BacksterosApiClient } from "@backsteros/api-client";

import type { ApiRowsSetter, WorkspacePowerSync } from "./workspace-data-types";
import { resolveEntityNumberAfterLocalCreate } from "./resolve-entity-number-after-local-create";

type NumberedRow = { id: string; number?: number | null };

/**
 * Server assigns entity `number` on upload; optimistic local rows carry `null`
 * until `resolveEntityNumberAfterLocalCreate` reads it back. Typed as
 * `number | null` so the optimistic row can be narrowed to the API row type.
 */
export const PENDING_ENTITY_NUMBER: number | null = null;

export type OptimisticLocalMetadataCreateInput<
  T extends NumberedRow = NumberedRow,
> = {
  id: string;
  applyOptimistic: () => void;
  rollback: () => void;
  /** Result (e.g. created row id) is ignored; `input.id` is authoritative. */
  createMetadata: () => Promise<unknown>;
  errorLabel: string;
  afterCreate?: () => Promise<void>;
  resolveNumberAfterUpload?: {
    client: BacksterosApiClient;
    powerSync: WorkspacePowerSync;
    fetchPath: string;
    setters: Array<ApiRowsSetter<T>>;
  };
};

/**
 * Shared local-first create: optimistic API cache → PowerSync insert → optional
 * flush + number resolution. Rolls back cache on insert failure.
 */
export async function optimisticLocalMetadataCreate<T extends NumberedRow>(
  input: OptimisticLocalMetadataCreateInput<T>,
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
