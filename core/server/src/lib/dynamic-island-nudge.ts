import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const TMP_TRIGGER = "/tmp/dynamic-island-tasks-refresh";

/** Notify the Dynamic Island bar to refresh task status counts. */
export function nudgeDynamicIslandTasksRefresh(reason?: string): void {
  void (async () => {
    const stamp = `${Date.now()}\n`;
    const homeTrigger = join(homedir(), ".config/dynamic-island/tasks-refresh");

    try {
      await mkdir(join(homedir(), ".config/dynamic-island"), { recursive: true });
      await writeFile(homeTrigger, stamp);
    } catch {
      // Island falls back to baseline polling.
    }

    try {
      await writeFile(TMP_TRIGGER, stamp);
    } catch {
      // /tmp may be unavailable in some environments.
    }

    void reason;
  })();
}
