import { useIsFocused } from "expo-router/react-navigation";
import { useCallback } from "react";
import { TextInput } from "react-native";

import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "./key-event";

import { clearGoLeaderSequence } from "./go-leader-sequence";
import { parseSectionTabIndex } from "./section-tab-shortcuts";

function isEditableFocused(): boolean {
  return TextInput.State.currentlyFocusedInput() != null;
}

type Props = {
  enabled?: boolean;
  /** Ordered section ids — index 0 is key `1`. */
  sectionCount: number;
  onSelectIndex: (index: number) => void;
};

/**
 * Number keys 1–9 switch entity section tabs (desktop `useSectionTabShortcuts`).
 * Skips while a TextInput is focused. Only the focused screen handles keys.
 */
export function useSectionTabShortcuts({
  enabled = true,
  sectionCount,
  onSelectIndex,
}: Props) {
  const isFocused = useIsFocused();
  const active = enabled && isFocused;

  const onKeyEvent = useCallback(
    (event: KeyPressEvent | KeyReleaseEvent) => {
      if (!active) return;
      if (event.eventType !== "press") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.repeat) return;
      if (isEditableFocused()) return;

      const tabIndex = parseSectionTabIndex(event.key, event.character);
      if (tabIndex == null) return;
      if (tabIndex < 0 || tabIndex >= sectionCount) return;

      clearGoLeaderSequence();
      onSelectIndex(tabIndex);
    },
    [active, onSelectIndex, sectionCount],
  );

  useKeyEventListener(onKeyEvent, {
    listenOnMount: true,
    captureModifiers: true,
  });
}
