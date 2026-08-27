/**
 * Nudge the Dynamic Island menu-bar app to refresh BacksterOS task counts.
 * Writes trigger files the island watches — no-op outside Tauri / on failure.
 */

const REFRESH_RELATIVE_PATH = ".config/dynamic-island/tasks-refresh";
const REFRESH_TMP_PATH = "/tmp/dynamic-island-tasks-refresh";

export function nudgeDynamicIslandTasksRefresh(): void {
  if (typeof window === "undefined") return;

  void (async () => {
    const stamp = `${Date.now()}\n`;
    let wroteHome = false;

    try {
      const { BaseDirectory, mkdir, writeTextFile } = await import(
        "@tauri-apps/plugin-fs"
      );
      await mkdir(".config/dynamic-island", {
        baseDir: BaseDirectory.Home,
        recursive: true,
      });
      await writeTextFile(REFRESH_RELATIVE_PATH, stamp, {
        baseDir: BaseDirectory.Home,
      });
      wroteHome = true;
    } catch (err) {
      console.warn("[dynamic-island] home refresh nudge failed", err);
    }

    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(REFRESH_TMP_PATH, stamp);
    } catch {
      if (!wroteHome) {
        console.warn(
          "[dynamic-island] could not write refresh trigger — island will rely on polling",
        );
      }
    }
  })();
}
