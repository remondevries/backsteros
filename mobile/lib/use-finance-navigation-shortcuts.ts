import { usePathname } from "expo-router";
import { useCallback } from "react";
import { TextInput } from "react-native";

import {
  findFinanceGoItemByLetter,
  type FinanceGoNavigationItem,
} from "./finance-go-navigation";
import {
  clearFinanceLeaderSequence,
  isFinanceLeaderSequencePending,
  registerFinanceLeaderKeyPress,
} from "./finance-leader-sequence";
import { clearGoLeaderSequence, isGoLeaderSequencePending } from "./go-leader-sequence";
import { keyEventToLetter } from "./go-navigation";
import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "./key-event";
import { useNavigationShortcutsSuspended } from "./navigation-shortcut-gate";

function isEditableFocused(): boolean {
  return TextInput.State.currentlyFocusedInput() != null;
}

function isFinancePath(pathname: string): boolean {
  return pathname === "/finance" || pathname.startsWith("/finance/");
}

/**
 * While in Finance: F arms a leader sequence; F then letter navigates
 * (desktop parity — e.g. F I → Invoices). No number-key section jumps.
 */
export function useFinanceNavigationShortcuts({
  enabled = true,
  onNavigate,
}: {
  enabled?: boolean;
  onNavigate: (item: FinanceGoNavigationItem) => void;
}) {
  const pathname = usePathname();
  const suspended = useNavigationShortcutsSuspended();
  const inFinance = isFinancePath(pathname);
  const active = enabled && !suspended && inFinance;

  const onKeyEvent = useCallback(
    (event: KeyPressEvent | KeyReleaseEvent) => {
      if (!active) return;
      if (event.eventType !== "press") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat) return;
      if (isEditableFocused()) return;

      const letter = keyEventToLetter(event.key, event.character);
      if (!letter) return;

      if (letter === "f" && !event.shiftKey) {
        // G then F is global Go → Finance; don't steal that chord.
        if (isGoLeaderSequencePending()) {
          return;
        }
        clearGoLeaderSequence();
        registerFinanceLeaderKeyPress();
        return;
      }

      if (!isFinanceLeaderSequencePending()) {
        return;
      }

      const binding = findFinanceGoItemByLetter(letter);
      clearFinanceLeaderSequence();
      if (!binding) return;

      onNavigate(binding);
    },
    [active, onNavigate],
  );

  useKeyEventListener(onKeyEvent, {
    listenOnMount: active,
    captureModifiers: true,
  });
}
