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
      const { homeDir, join } = await import("@tauri-apps/api/path");
      const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
      const home = await homeDir();
      const dir = await join(home, ".config/dynamic-island");
      const file = await join(home, REFRESH_RELATIVE_PATH);
      await mkdir(dir, { recursive: true });
      await writeTextFile(file, stamp);
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
