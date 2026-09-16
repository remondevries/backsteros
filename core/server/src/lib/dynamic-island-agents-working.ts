import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const STATE_RELATIVE = ".config/dynamic-island/agents-working.json";
const STATE_TMP = "/tmp/dynamic-island-agents-working.json";

export type DynamicIslandAgentsWorkingPayload = {
  version: 1;
  count: number;
  taskIds: string[];
  updatedAt: number;
};

/**
 * Write live agent-working task ids for the Dynamic Island menu-bar app.
 * Silent on failure — the island falls back to count 0 / polling.
 */
export function publishDynamicIslandAgentsWorking(
  taskIds: readonly string[],
): void {
  const unique = [...new Set(taskIds.map((id) => id.trim()).filter(Boolean))];
  const payload: DynamicIslandAgentsWorkingPayload = {
    version: 1,
    count: unique.length,
    taskIds: unique,
    updatedAt: Date.now(),
  };
  const body = `${JSON.stringify(payload)}\n`;

  void (async () => {
    try {
      const dir = join(homedir(), ".config/dynamic-island");
      await mkdir(dir, { recursive: true });
      await writeFile(join(homedir(), STATE_RELATIVE), body);
    } catch {
      // Home path may be unavailable (e.g. restricted sandbox).
    }

    try {
      await writeFile(STATE_TMP, body);
    } catch {
      // /tmp may be unavailable in some environments.
    }
  })();
}
