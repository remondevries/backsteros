import { invoke } from "./tauri-invoke-instrumentation";
import {
  composeOverlayContextFromSnapshot,
  composeOverlayContextToSnapshot,
  type ComposeOverlayContext,
  type ComposeOverlayContextSnapshot,
} from "./compose-overlay-context";

export const DESKTOP_OVERLAY_WINDOW_LABEL = "overlay";

export const DESKTOP_OVERLAY_PALETTE_PATH = "/desktop-overlay/palette";
export const DESKTOP_OVERLAY_COMPOSE_PATH = "/desktop-overlay/compose";

export const DESKTOP_OVERLAY_NAVIGATE_EVENT = "desktop-overlay:navigate";
export const DESKTOP_OVERLAY_TOGGLE_PALETTE_EVENT =
  "desktop-overlay:toggle-palette";
export const DESKTOP_OVERLAY_TOGGLE_COMPOSE_EVENT =
  "desktop-overlay:toggle-compose";
/** Overlay asks main for warm workspace-backed compose options. */
export const DESKTOP_OVERLAY_REQUEST_COMPOSE_CONTEXT_EVENT =
  "desktop-overlay:request-compose-context";
/** Main replies with a JSON-safe compose snapshot (no PowerSync in overlay). */
export const DESKTOP_OVERLAY_COMPOSE_CONTEXT_EVENT =
  "desktop-overlay:compose-context";

export type DesktopOverlayNavigatePayload = {
  href: string;
};

export async function toggleDesktopOverlayPalette(): Promise<void> {
  try {
    await invoke("toggle_desktop_overlay_palette");
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

export async function toggleDesktopOverlayCompose(): Promise<void> {
  try {
    await invoke("toggle_desktop_overlay_compose");
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

export async function isDesktopOverlayWindow(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const { getCurrentWebviewWindow } = await import(
      "@tauri-apps/api/webviewWindow"
    );
    return getCurrentWebviewWindow().label === DESKTOP_OVERLAY_WINDOW_LABEL;
  } catch {
    return false;
  }
}

export function isDesktopOverlayPath(pathname: string): boolean {
  return pathname.startsWith("/desktop-overlay");
}

export async function hideDesktopOverlayWindow(): Promise<void> {
  try {
    await invoke("hide_desktop_overlay");
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

export async function resizeDesktopOverlayWindow(
  height: number,
): Promise<void> {
  try {
    await invoke("resize_desktop_overlay", { height });
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

export async function completeDesktopOverlayNavigation(
  href: string,
): Promise<void> {
  try {
    const { emit } = await import("@tauri-apps/api/event");

    await emit(DESKTOP_OVERLAY_NAVIGATE_EVENT, {
      href,
    } satisfies DesktopOverlayNavigatePayload);

    await hideDesktopOverlayWindow();

    try {
      await invoke("focus_main_window");
    } catch {
      // Ignore when not running in the desktop shell.
    }
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

/**
 * Ask the main window for compose projects/contacts/folders already in
 * workspace memory. Returns null on timeout / no main listener — caller falls
 * back to REST. Overlay deliberately has PowerSync disabled.
 */
export async function requestComposeOverlayContextFromMain(
  timeoutMs = 280,
): Promise<ComposeOverlayContext | null> {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const { emit, listen } = await import("@tauri-apps/api/event");

    return await new Promise<ComposeOverlayContext | null>((resolve) => {
      let settled = false;
      let unlisten: (() => void) | undefined;

      const finish = (value: ComposeOverlayContext | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        unlisten?.();
        resolve(value);
      };

      const timer = window.setTimeout(() => finish(null), timeoutMs);

      void listen<ComposeOverlayContextSnapshot>(
        DESKTOP_OVERLAY_COMPOSE_CONTEXT_EVENT,
        (event) => {
          const payload = event.payload;
          if (!payload || !Array.isArray(payload.projects)) {
            finish(null);
            return;
          }
          try {
            finish(composeOverlayContextFromSnapshot(payload));
          } catch {
            finish(null);
          }
        },
      )
        .then((fn) => {
          unlisten = fn;
          if (settled) {
            fn();
            return;
          }
          return emit(DESKTOP_OVERLAY_REQUEST_COMPOSE_CONTEXT_EVENT);
        })
        .catch(() => finish(null));
    });
  } catch {
    return null;
  }
}

export function snapshotComposeOverlayContext(
  context: ComposeOverlayContext,
): ComposeOverlayContextSnapshot {
  return composeOverlayContextToSnapshot(context);
}
