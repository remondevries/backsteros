/**
 * Publish live agent-working task ids to the Dynamic Island menu-bar app.
 * Writes JSON state files the island watches — no-op outside Tauri / on failure.
 */

const STATE_RELATIVE_PATH = ".config/dynamic-island/agents-working.json";
const STATE_TMP_PATH = "/tmp/dynamic-island-agents-working.json";

export type DynamicIslandAgentsWorkingPayload = {
  version: 1;
  count: number;
  taskIds: string[];
  updatedAt: number;
};

let warnedHome = false;
let warnedTmp = false;

export function publishDynamicIslandAgentsWorking(
  taskIds: ReadonlySet<string> | readonly string[],
): void {
  if (typeof window === "undefined") return;

  const ids = Array.isArray(taskIds)
    ? [...taskIds]
    : [...taskIds];
  const payload: DynamicIslandAgentsWorkingPayload = {
    version: 1,
    count: ids.length,
    taskIds: ids,
    updatedAt: Date.now(),
  };
  const body = `${JSON.stringify(payload)}\n`;

  void (async () => {
    let wroteHome = false;

    try {
      const { homeDir, join } = await import("@tauri-apps/api/path");
      const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");
      const home = await homeDir();
      const dir = await join(home, ".config/dynamic-island");
      const file = await join(home, STATE_RELATIVE_PATH);
      await mkdir(dir, { recursive: true });
      await writeTextFile(file, body);
      wroteHome = true;
    } catch (err) {
      if (!warnedHome) {
        warnedHome = true;
        console.warn("[dynamic-island] agents-working home write failed", err);
      }
    }

    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(STATE_TMP_PATH, body);
    } catch (err) {
      if (!wroteHome && !warnedTmp) {
        warnedTmp = true;
        console.warn(
          "[dynamic-island] agents-working write failed — island will show 0",
          err,
        );
      }
    }
  })();
}

/** Clear the island indicator (e.g. on desktop quit / provider unmount). */
export function clearDynamicIslandAgentsWorking(): void {
  publishDynamicIslandAgentsWorking([]);
}
