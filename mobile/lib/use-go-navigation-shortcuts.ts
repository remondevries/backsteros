import { useRouter, type Href } from "expo-router";
import { useCallback } from "react";
import { TextInput } from "react-native";

import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "./key-event";
import {
  clearGoLeaderSequence,
  isGoLeaderSequencePending,
  registerGoLeaderKeyPress,
} from "./go-leader-sequence";
import { clearFinanceLeaderSequence } from "./finance-leader-sequence";
import {
  findGoItemByLetter,
  keyEventToLetter,
} from "./go-navigation";
import { useNavigationShortcutsSuspended } from "./navigation-shortcut-gate";

function isEditableFocused(): boolean {
  return TextInput.State.currentlyFocusedInput() != null;
}

/**
 * Desktop-style G → letter navigation for hardware keyboards (iPad Magic
 * Keyboard, Bluetooth, etc.). First `g` arms Go mode for ~1s; second letter
 * navigates (e.g. G then P → Projects). Skips while a TextInput is focused
 * or navigation shortcuts are suspended (Settings → Server).
 */
export function useGoNavigationShortcuts(enabled = true) {
  const router = useRouter();
  const suspended = useNavigationShortcutsSuspended();
  const active = enabled && !suspended;

  const onKeyEvent = useCallback(
    (event: KeyPressEvent | KeyReleaseEvent) => {
      if (!active) return;
      if (event.eventType !== "press") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;
      if (isEditableFocused()) return;

      const letter = keyEventToLetter(event.key, event.character);
      if (!letter) return;

      if (letter === "g" && !event.shiftKey) {
        clearFinanceLeaderSequence();
        if (isGoLeaderSequencePending()) {
          // Second G within the window — keep pending / re-arm.
          registerGoLeaderKeyPress();
          return;
        }
        registerGoLeaderKeyPress();
        return;
      }

      if (!isGoLeaderSequencePending()) {
        return;
      }

      const binding = findGoItemByLetter(letter);
      clearGoLeaderSequence();
      if (!binding) return;

      router.navigate(binding.href as Href);
    },
    [active, router],
  );

  useKeyEventListener(onKeyEvent, {
    listenOnMount: active,
    captureModifiers: true,
  });
}
