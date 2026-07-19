/**
 * Tiny session LRU for Tier D markdown bodies and Tier B attachment lists.
 * Bounded — never a full vault. PDF blobs must not use this (load for the open
 * letter only; discard when the viewer unmounts). See docs/07-performance.md.
 */
export function createSessionLruCache<T>(limit: number) {
  const map = new Map<string, T>();

  return {
    peek(key: string): T | null {
      return map.get(key) ?? null;
    },
    set(key: string, value: T): void {
      if (map.has(key)) {
        map.delete(key);
      }
      map.set(key, value);
      while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest == null) break;
        map.delete(oldest);
      }
    },
    delete(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    },
  };
}
