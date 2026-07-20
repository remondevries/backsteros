/** Shallow row equality for PowerSync watch dedupe. */
export function rowsShallowEqual<T extends Record<string, unknown>>(
  previous: T[],
  next: T[],
): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (let i = 0; i < previous.length; i++) {
    const a = previous[i];
    const b = next[i];
    if (a === b) continue;
    if (!a || !b) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (a[key] !== b[key]) return false;
    }
  }
  return true;
}
