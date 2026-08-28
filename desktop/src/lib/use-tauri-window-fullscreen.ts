import { useEffect, useState } from "react";

function readDomFullscreenHint(): boolean {
  if (typeof window === "undefined" || typeof screen === "undefined") {
    return false;
  }
  // Native macOS fullscreen often matches the display size; use as a hint when
  // Tauri resize events are delayed mid-transition.
  return (
    window.outerHeight >= screen.height - 1 &&
    window.outerWidth >= screen.width - 1
  );
}

/** Toggle native Tauri window fullscreen (macOS space / Windows exclusive FS). */
export async function toggleTauriWindowFullscreen(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  const currentlyFullscreen = await appWindow.isFullscreen();
  await appWindow.setFullscreen(!currentlyFullscreen);
}

/**
 * Tracks whether the current Tauri window is in native fullscreen.
 * Used to drop macOS traffic-light insets when the titlebar controls are hidden.
 */
export function useTauriWindowFullscreen(): boolean {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      const syncFromTauri = async (
        appWindow: {
          isFullscreen: () => Promise<boolean>;
        },
      ) => {
        try {
          const next = await appWindow.isFullscreen();
          if (!cancelled) setFullscreen(next);
          return;
        } catch {
          /* fall through to DOM hint */
        }
        if (!cancelled) setFullscreen(readDomFullscreenHint());
      };

      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();

        await syncFromTauri(appWindow);

        unlisteners.push(
          await appWindow.onResized(() => {
            void syncFromTauri(appWindow);
          }),
        );
        unlisteners.push(
          await appWindow.onMoved(() => {
            void syncFromTauri(appWindow);
          }),
        );

        const focusUnlisten = await appWindow.onFocusChanged(() => {
          void syncFromTauri(appWindow);
        });
        unlisteners.push(focusUnlisten);
      } catch {
        if (!cancelled) setFullscreen(readDomFullscreenHint());
      }

      const onResize = () => {
        // Cheap secondary signal while the native fullscreen animation runs.
        if (!cancelled) {
          void (async () => {
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              const next = await getCurrentWindow().isFullscreen();
              if (!cancelled) setFullscreen(next);
            } catch {
              if (!cancelled) setFullscreen(readDomFullscreenHint());
            }
          })();
        }
      };
      window.addEventListener("resize", onResize);
      unlisteners.push(() => window.removeEventListener("resize", onResize));
    })();

    return () => {
      cancelled = true;
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);

  return fullscreen;
}
