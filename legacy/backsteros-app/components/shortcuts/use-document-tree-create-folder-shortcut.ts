"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useCommandPalette } from "@/components/command-palette/command-palette-context";
import { requestDocumentTreeCreateFolder } from "@/lib/shortcuts/document-tree-create-folder-shortcut";
import { shouldHandleDocumentTreeCreateFolderShortcut } from "@/lib/shortcuts/should-handle-document-tree-create-folder-shortcut";

export function useDocumentTreeCreateFolderShortcut({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const pathname = usePathname();
  const { open: commandPaletteOpen } = useCommandPalette();

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (
        commandPaletteOpen ||
        !shouldHandleDocumentTreeCreateFolderShortcut(event, pathname) ||
        !requestDocumentTreeCreateFolder()
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commandPaletteOpen, enabled, pathname]);
}
