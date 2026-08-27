"use client";

import { useEffect } from "react";

import { useCommandPaletteRuntimeRefs } from "../components/command-palette/command-palette-context.js";
import { requestDocumentTreeCreateFolder } from "./document-tree-create-folder-shortcut.js";
import { shouldHandleDocumentTreeCreateFolderShortcut } from "./should-handle-document-tree-create-folder-shortcut.js";
import { useLatestRef } from "../shared/use-latest-ref.js";

/**
 * ⇧C creates a folder in the focused document library (knowledge / project docs).
 */
export function useDocumentTreeCreateFolderShortcut({
  pathname,
  enabled = true,
}: {
  pathname: string;
  enabled?: boolean;
}) {
  const { openRef } = useCommandPaletteRuntimeRefs();
  const pathnameRef = useLatestRef(pathname);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        openRef.current ||
        !shouldHandleDocumentTreeCreateFolderShortcut(
          event,
          pathnameRef.current,
        ) ||
        !requestDocumentTreeCreateFolder()
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, openRef, pathnameRef]);
}
