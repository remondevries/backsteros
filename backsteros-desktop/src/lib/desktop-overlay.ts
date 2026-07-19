export const DESKTOP_OVERLAY_WINDOW_LABEL = "overlay";

export const DESKTOP_OVERLAY_PALETTE_PATH = "/desktop-overlay/palette";
export const DESKTOP_OVERLAY_COMPOSE_PATH = "/desktop-overlay/compose";

export const DESKTOP_OVERLAY_NAVIGATE_EVENT = "desktop-overlay:navigate";
export const DESKTOP_OVERLAY_TOGGLE_PALETTE_EVENT =
  "desktop-overlay:toggle-palette";
export const DESKTOP_OVERLAY_TOGGLE_COMPOSE_EVENT =
  "desktop-overlay:toggle-compose";

export type DesktopOverlayNavigatePayload = {
  href: string;
};

export async function toggleDesktopOverlayPalette(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toggle_desktop_overlay_palette");
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

export async function toggleDesktopOverlayCompose(): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
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
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("hide_desktop_overlay");
  } catch {
    // Ignore when not running in the desktop shell.
  }
}

export async function resizeDesktopOverlayWindow(
  height: number,
): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
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
    const { invoke } = await import("@tauri-apps/api/core");

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
