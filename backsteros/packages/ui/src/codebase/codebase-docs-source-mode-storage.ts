/**
 * Persisted Docs tab source for codebase projects (Repo / Local).
 */

import {
  DEFAULT_CODEBASE_DOCS_SOURCE_MODE,
  parseCodebaseDocsSourceMode,
  type CodebaseDocsSourceMode,
} from "./codebase-docs-source-mode.js";

const STORAGE_KEY = "backsteros.codebase.docs-source-mode";

const listeners = new Set<() => void>();

let cachedMode: CodebaseDocsSourceMode | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeCodebaseDocsSourceMode(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readCodebaseDocsSourceMode(): CodebaseDocsSourceMode {
  if (cachedMode != null) return cachedMode;
  if (typeof window === "undefined") {
    return DEFAULT_CODEBASE_DOCS_SOURCE_MODE;
  }
  try {
    cachedMode = parseCodebaseDocsSourceMode(
      window.localStorage.getItem(STORAGE_KEY),
    );
  } catch {
    cachedMode = DEFAULT_CODEBASE_DOCS_SOURCE_MODE;
  }
  return cachedMode;
}

export function writeCodebaseDocsSourceMode(
  mode: CodebaseDocsSourceMode,
): void {
  const next = parseCodebaseDocsSourceMode(mode);
  if (cachedMode === next) return;
  cachedMode = next;
  if (typeof window !== "undefined") {
    try {
      if (next === DEFAULT_CODEBASE_DOCS_SOURCE_MODE) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Ignore quota / private-mode failures.
    }
  }
  notify();
}
