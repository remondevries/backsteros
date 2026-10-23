import { useCallback, useSyncExternalStore } from "react";

import type { CodebaseDocsSourceMode } from "./codebase-docs-source-mode.js";
import {
  readCodebaseDocsSourceMode,
  subscribeCodebaseDocsSourceMode,
  writeCodebaseDocsSourceMode,
} from "./codebase-docs-source-mode-storage.js";

export function useCodebaseDocsSourceMode(): [
  CodebaseDocsSourceMode,
  (mode: CodebaseDocsSourceMode) => void,
] {
  const mode = useSyncExternalStore(
    subscribeCodebaseDocsSourceMode,
    readCodebaseDocsSourceMode,
    readCodebaseDocsSourceMode,
  );
  const setMode = useCallback((next: CodebaseDocsSourceMode) => {
    writeCodebaseDocsSourceMode(next);
  }, []);
  return [mode, setMode];
}
