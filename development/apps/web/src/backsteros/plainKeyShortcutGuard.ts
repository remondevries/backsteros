import { isBareKeyShortcutBlockedByEditable } from "~/keybindings";

import { isBacksterosContentEditModeActive } from "./markdown-editor/contentViewMode";

/**
 * True when bare / shift-only page hotkeys (j/k, C, G, `[`, letters, …) must
 * yield — matches desktop `shouldHandleGlobalShortcut` inverted for editors.
 *
 * Blocks while description Edit mode is active (even if focus briefly left
 * CodeMirror) and while focus is in any typing surface.
 */
export function shouldYieldPlainKeyHotkey(
  event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "target" | "key">,
  options?: {
    readonly contentEditModeActive?: boolean | undefined;
    readonly activeElement?: EventTarget | null | undefined;
  },
): boolean {
  const contentEditModeActive =
    options?.contentEditModeActive ?? isBacksterosContentEditModeActive();
  if (contentEditModeActive) return true;

  return isBareKeyShortcutBlockedByEditable(event, options?.activeElement);
}
