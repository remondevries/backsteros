/**
 * Tiny LRU for Tier D markdown bodies and Tier B attachment lists.
 * Bounded — never a full vault. PDF blobs must not use this (load for the open
 * letter only; discard when the viewer unmounts). See docs/07-performance.md.
 *
 * RAM by default. Pass persist options to hydrate from localStorage so a
 * reload still paints cached journal / knowledge bodies and letter
 * attachment lists on the first frame.
 */

export type SessionLruCache<T> = {
  peek(key: string): T | null;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
};

export type LruStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PersistedLruOptions = {
  limit: number;
  storageKey: string;
  storage?: LruStorage | null;
  /** Skip persisting a value whose JSON is larger than this (RAM still keeps it). */
  maxValueChars?: number;
};

type PersistEnvelope = {
  v: 1;
  entries: Array<[string, unknown]>;
};

function defaultStorage(): LruStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function createSessionLruCache<T>(limit: number): SessionLruCache<T> {
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

export function createPersistedSessionLruCache<T>(
  options: PersistedLruOptions,
): SessionLruCache<T> {
  const { limit, storageKey, maxValueChars } = options;
  const storage =
    options.storage === undefined ? defaultStorage() : options.storage;
  const map = new Map<string, T>();

  function evict(): void {
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest == null) break;
      map.delete(oldest);
    }
  }

  function persist(): void {
    if (!storage) return;
    const entries: Array<[string, T]> = [];
    for (const [key, value] of map) {
      try {
        const encoded = JSON.stringify(value);
        if (maxValueChars != null && encoded.length > maxValueChars) {
          continue;
        }
        entries.push([key, value]);
      } catch {
        // Non-serializable values stay in RAM only.
      }
    }
    try {
      const envelope: PersistEnvelope = { v: 1, entries };
      storage.setItem(storageKey, JSON.stringify(envelope));
    } catch {
      // Quota or private mode — keep the RAM cache.
    }
  }

  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistEnvelope;
        if (Array.isArray(parsed.entries)) {
          for (const entry of parsed.entries) {
            if (!Array.isArray(entry) || typeof entry[0] !== "string") {
              continue;
            }
            map.set(entry[0], entry[1] as T);
          }
          evict();
        }
      }
    } catch {
      // Corrupt payload — start empty.
    }
  }

  return {
    peek(key: string): T | null {
      return map.get(key) ?? null;
    },
    set(key: string, value: T): void {
      if (map.has(key)) {
        map.delete(key);
      }
      map.set(key, value);
      evict();
      persist();
    },
    delete(key: string): void {
      if (!map.delete(key)) return;
      persist();
    },
    clear(): void {
      if (map.size === 0) return;
      map.clear();
      persist();
    },
  };
}
