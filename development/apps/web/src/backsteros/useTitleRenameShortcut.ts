import { useEffect, useRef } from "react";

import { registerTitleRename } from "./titleRenameShortcut";

export { isTitleRenameShortcut, registerTitleRename } from "./titleRenameShortcut";

/**
 * ⌘R / Ctrl+R focuses the entity title for rename — same chord as BacksterOS
 * desktop (`useTitleRenameShortcut`).
 */
export function useTitleRenameShortcut(
  onRename: () => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const onRenameRef = useRef(onRename);
  onRenameRef.current = onRename;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    return registerTitleRename({
      rename: () => {
        onRenameRef.current();
      },
      isEnabled: () => Boolean(enabledRef.current),
    });
  }, []);
}
