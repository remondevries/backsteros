import { usePathname, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { Platform, TextInput } from "react-native";

import { useAppleKeyCommand } from "./apple-key-commands";
import { clearGoLeaderSequence } from "./go-leader-sequence";
import { isPadDevice } from "./device";
import {
  useKeyEventListener,
  type KeyPressEvent,
  type KeyReleaseEvent,
} from "./key-event";
import { useNavigationShortcutsSuspended } from "./navigation-shortcut-gate";

function isEditableFocused(): boolean {
  return TextInput.State.currentlyFocusedInput() != null;
}

function isEscapeKey(key: string, character?: string | null): boolean {
  if (key === "Escape" || key === "Esc") return true;
  if (character === "\u001b") return true;
  return false;
}

/** Strip Expo Router groups like `/(app)/tasks` → `/tasks`. */
export function normalizePathname(pathname: string): string {
  const stripped = pathname
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment))
    .join("/");
  return stripped ? `/${stripped}` : "/";
}

/** Tab / section list homes — Escape should not leave these (desktop parity). */
export function isSectionHomePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname).replace(/\/$/, "") || "/";
  return (
    normalized === "/" ||
    normalized === "/inbox" ||
    normalized === "/journal" ||
    normalized === "/tasks" ||
    normalized === "/projects" ||
    normalized === "/areas" ||
    normalized === "/letters" ||
    normalized === "/finance" ||
    normalized === "/knowledge" ||
    normalized === "/contacts" ||
    normalized === "/organizations" ||
    normalized === "/compose" ||
    normalized === "/development" ||
    normalized === "/habits"
  );
}

/**
 * iPad inbox / journal keep the list mounted beside detail — Escape should
 * not pop the detail back to an empty index (desktop side-panel parity).
 */
export function shouldBlockEscapeBackOnPath(pathname: string): boolean {
  if (isSectionHomePath(pathname)) return true;
  if (!isPadDevice()) return false;
  const normalized = normalizePathname(pathname).replace(/\/$/, "") || "/";
  return (
    normalized.startsWith("/inbox/") || normalized.startsWith("/journal/")
  );
}

/**
 * Escape → same as the header back button (desktop `useEscapeBackNavigation`).
 * Uses UIKeyCommand on iOS (reliable with Magic Keyboard) and expo-key-event
 * elsewhere / as fallback.
 */
export function useEscapeBackNavigation(enabled = true) {
  const router = useRouter();
  const pathname = usePathname();
  const lastFiredAtRef = useRef(0);
  const suspended = useNavigationShortcutsSuspended();
  const active = enabled && !suspended;

  const goBack = useCallback(() => {
    if (!active) return;
    if (isEditableFocused()) return;
    if (shouldBlockEscapeBackOnPath(pathname)) return;
    if (!router.canGoBack()) return;

    const now = Date.now();
    if (now - lastFiredAtRef.current < 250) return;
    lastFiredAtRef.current = now;

    clearGoLeaderSequence();
    router.back();
  }, [active, pathname, router]);

  const escapeCommand = useMemo(
    () => ({
      id: "escape-back",
      input: "escape",
      modifiers: [] as Array<"command" | "control" | "option" | "shift">,
      title: "Back",
    }),
    [],
  );

  useAppleKeyCommand(escapeCommand, goBack, active && Platform.OS === "ios");

  const onKeyEvent = useCallback(
    (event: KeyPressEvent | KeyReleaseEvent) => {
      if (!active) return;
      if (event.eventType !== "press") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.repeat) return;
      if (!isEscapeKey(event.key, event.character)) return;
      goBack();
    },
    [active, goBack],
  );

  useKeyEventListener(onKeyEvent, {
    listenOnMount: active,
    captureModifiers: true,
  });
}
