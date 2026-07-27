"use client";

import { useEffect } from "react";

import { useCommandPalette } from "./components/command-palette-context.js";
import { requestDocumentTreeCreateFolder } from "./document-tree-create-folder-shortcut.js";
import { shouldHandleDocumentTreeCreateFolderShortcut } from "./should-handle-document-tree-create-folder-shortcut.js";
import { useLatestRef } from "./use-latest-ref.js";

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
  const { open: commandPaletteOpen } = useCommandPalette();
  const pathnameRef = useLatestRef(pathname);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        commandPaletteOpen ||
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
  }, [commandPaletteOpen, enabled, pathnameRef]);
}
