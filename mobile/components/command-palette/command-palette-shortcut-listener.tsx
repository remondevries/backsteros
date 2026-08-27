import { useKeyEventListener, type KeyPressEvent } from "../../lib/key-event";
import { useCommandPalette } from "../../lib/use-command-palette";

/** Cmd+K / Ctrl+K opens the global command palette on iPad hardware keyboards. */
export function CommandPaletteShortcutListener() {
  const { togglePalette } = useCommandPalette();

  useKeyEventListener(
    (event: KeyPressEvent) => {
      if (event.eventType !== "press") return;
      const key = event.key?.toLowerCase();
      if (key !== "k") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      togglePalette();
    },
    { listenOnMount: true, captureModifiers: true },
  );

  return null;
}
