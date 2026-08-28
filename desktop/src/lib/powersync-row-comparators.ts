export type PowerSyncRowComparator<T> = {
  keyBy: (item: T) => string;
  compareBy: (item: T) => string;
};

/**
 * Compare PowerSync list rows by primary key + `updated_at` only.
 * Avoids JSON.stringify on every differential watch tick (large lists).
 */
export function powerSyncRowComparatorByUpdatedAt<
  T extends Record<string, unknown>,
>(
  idColumn: keyof T & string = "id" as keyof T & string,
  updatedColumn: keyof T & string = "updated_at" as keyof T & string,
): PowerSyncRowComparator<T> {
  return {
    keyBy: (row) => String(row[idColumn] ?? ""),
    compareBy: (row) => String(row[updatedColumn] ?? ""),
  };
}

/** Tier A/B workspace list watches — all tables use `id` + `updated_at`. */
export const WORKSPACE_LIST_ROW_COMPARATOR =
  powerSyncRowComparatorByUpdatedAt<Record<string, unknown>>();

/** Document content version watch — metadata uses content_version bumps. */
export const DOCUMENT_VERSION_ROW_COMPARATOR: PowerSyncRowComparator<
  Record<string, unknown>
> = {
  keyBy: (row) => String(row.id ?? ""),
  compareBy: (row) =>
    `${row.content_version ?? ""}\0${row.content_etag ?? ""}\0${row.updated_at ?? ""}`,
};
