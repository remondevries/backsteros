import { useCallback, useMemo, useRef } from "react";
import { Platform } from "react-native";

import { useAppleKeyCommand } from "./apple-key-commands";

type Props = {
  enabled?: boolean;
  editing: boolean;
  /** When false, ⌘E in preview is a no-op (e.g. content still loading). */
  canEnterEdit: boolean;
  onEnterEdit: () => void;
  /** Leave edit → preview (desktop flushes save on ⌘E). */
  onLeaveEdit: () => void;
};

/**
 * Desktop-parity ⌘E toggle between markdown preview and edit on iPad
 * (UIKeyCommand — expo-key-event does not reliably receive ⌘ letter shortcuts).
 */
export function useContentViewModeShortcut({
  enabled = true,
  editing,
  canEnterEdit,
  onEnterEdit,
  onLeaveEdit,
}: Props) {
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const canEnterEditRef = useRef(canEnterEdit);
  canEnterEditRef.current = canEnterEdit;
  const onEnterEditRef = useRef(onEnterEdit);
  onEnterEditRef.current = onEnterEdit;
  const onLeaveEditRef = useRef(onLeaveEdit);
  onLeaveEditRef.current = onLeaveEdit;

  const active = enabled && Platform.OS === "ios";

  const toggle = useCallback(() => {
    if (editingRef.current) {
      onLeaveEditRef.current();
      return;
    }
    if (!canEnterEditRef.current) return;
    onEnterEditRef.current();
  }, []);

  const commandCmd = useMemo(
    () => ({
      id: "content-view-mode-toggle-cmd",
      input: "e",
      modifiers: ["command" as const],
      title: "Toggle Edit",
    }),
    [],
  );

  const commandCtrl = useMemo(
    () => ({
      id: "content-view-mode-toggle-ctrl",
      input: "e",
      modifiers: ["control" as const],
      title: "Toggle Edit",
    }),
    [],
  );

  useAppleKeyCommand(commandCmd, toggle, active);
  useAppleKeyCommand(commandCtrl, toggle, active);
}
