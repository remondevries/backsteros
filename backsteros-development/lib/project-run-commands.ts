const STORAGE_KEY = "backsteros-development.project-run-commands";

type CommandMap = Record<string, string>;

function readMap(): CommandMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: CommandMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: CommandMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Per-project shell command for the Run Application control. */
export function getProjectRunCommand(projectId: string): string {
  return readMap()[projectId] ?? "";
}

export function setProjectRunCommand(projectId: string, command: string): void {
  const map = readMap();
  const trimmed = command.trim();
  if (!trimmed) {
    if (!(projectId in map)) return;
    delete map[projectId];
  } else {
    map[projectId] = command;
  }
  writeMap(map);
}
