/**
 * OS-49: only forward fields that actually changed so PowerSync/REST dual-writes
 * cannot rewrite key/status/localWorkingDirectory from a stale full-row copy.
 */

const PROJECT_PATCH_KEYS = [
  "name",
  "key",
  "status",
  "priority",
  "area",
  "areaId",
  "organizationId",
  "icon",
  "type",
  "provider",
  "category",
  "githubRepository",
  "localWorkingDirectory",
  "healthCheckMode",
  "healthCheckDomain",
  "hourlyRateCents",
  "budgets",
  "startDate",
  "dueDate",
  "summary",
  "description",
] as const;

export type ProjectPatchField = (typeof PROJECT_PATCH_KEYS)[number];

function normalizeComparable(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

export function diffProjectPatch(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown>,
  keys: readonly ProjectPatchField[] = PROJECT_PATCH_KEYS,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const nextValue = next[key];
    if (nextValue === undefined) continue;
    const prevValue = previous?.[key];
    if (normalizeComparable(prevValue) === normalizeComparable(nextValue)) {
      continue;
    }
    patch[key] = nextValue;
  }
  return patch;
}
