/**
 * Merge replace / add / remove commit SHA lists (dedupe case-insensitive).
 * Returns `undefined` when nothing changes (OS-64).
 */
export function mergeLinkedCommitShas(
  existing: readonly string[] | null | undefined,
  replace: readonly string[] | undefined,
  add: readonly string[] | undefined,
  remove: readonly string[] | undefined,
): string[] | undefined {
  const hasReplace = replace !== undefined;
  const hasAdd = Array.isArray(add) && add.length > 0;
  const hasRemove = Array.isArray(remove) && remove.length > 0;
  if (!hasReplace && !hasAdd && !hasRemove) return undefined;

  const base = hasReplace
    ? [...replace]
    : Array.isArray(existing)
      ? [...existing]
      : [];
  const seen = new Set(base.map((sha) => sha.toLowerCase()));
  const out = [...base];

  if (hasAdd) {
    for (const sha of add!) {
      const key = sha.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sha);
    }
  }

  if (hasRemove) {
    const removeSet = new Set(remove!.map((sha) => sha.toLowerCase()));
    return out.filter((sha) => !removeSet.has(sha.toLowerCase()));
  }
  return out;
}
