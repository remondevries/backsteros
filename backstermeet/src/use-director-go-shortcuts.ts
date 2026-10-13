import { useEffect, useRef } from "react";

const SEQUENCE_TIMEOUT_MS = 1000;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest("[contenteditable='true']") != null;
}

/**
 * Two-key director shortcuts:
 * - g → p: toggle presentation / fullscreen camera
 * - r → l: toggle ring light
 * - c → o: toggle camera
 * - m → o: toggle microphone
 * - o → r: open room
 * - c → r: close room
 * - l → m: light mode
 * - d → m: dark mode
 */
export function useDirectorGoShortcuts({
  enabled = true,
  onTogglePresentation,
  onToggleRingLight,
  onToggleCamera,
  onToggleMicrophone,
  onOpenRoom,
  onCloseRoom,
  onLightMode,
  onDarkMode,
}: {
  enabled?: boolean;
  onTogglePresentation: () => void;
  onToggleRingLight: () => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onOpenRoom: () => void;
  onCloseRoom: () => void;
  onLightMode: () => void;
  onDarkMode: () => void;
}) {
  const actionsRef = useRef({
    onTogglePresentation,
    onToggleRingLight,
    onToggleCamera,
    onToggleMicrophone,
    onOpenRoom,
    onCloseRoom,
    onLightMode,
    onDarkMode,
  });
  actionsRef.current = {
    onTogglePresentation,
    onToggleRingLight,
    onToggleCamera,
    onToggleMicrophone,
    onOpenRoom,
    onCloseRoom,
    onLightMode,
    onDarkMode,
  };

  useEffect(() => {
    if (!enabled) return;

    const prefixes = new Set(["g", "r", "c", "m", "o", "l", "d"]);
    let pendingPrefix: string | null = null;
    let prefixStartedAt = 0;

    function clearSequence() {
      pendingPrefix = null;
      prefixStartedAt = 0;
    }

    function sequenceIsPending() {
      return (
        pendingPrefix !== null &&
        Date.now() - prefixStartedAt < SEQUENCE_TIMEOUT_MS
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (sequenceIsPending()) {
        const sequence = `${pendingPrefix}${key}`;
        const actions: Record<string, () => void> = {
          gp: actionsRef.current.onTogglePresentation,
          rl: actionsRef.current.onToggleRingLight,
          co: actionsRef.current.onToggleCamera,
          mo: actionsRef.current.onToggleMicrophone,
          or: actionsRef.current.onOpenRoom,
          cr: actionsRef.current.onCloseRoom,
          lm: actionsRef.current.onLightMode,
          dm: actionsRef.current.onDarkMode,
        };
        const action = actions[sequence];
        clearSequence();
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          action();
          return;
        }
      } else {
        clearSequence();
      }

      if (prefixes.has(key) && !event.shiftKey) {
        event.preventDefault();
        pendingPrefix = key;
        prefixStartedAt = Date.now();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [enabled]);
}
