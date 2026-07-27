const STORAGE_KEY = "backsteros-development.project-directories";

type DirectoryMap = Record<string, string>;

function readMap(): DirectoryMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: DirectoryMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: DirectoryMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Peek a path from the pre-API localStorage map (does not clear). */
export function peekLegacyLocalDirectory(projectId: string): string | null {
  return readMap()[projectId]?.trim() || null;
}

/** Drop a project entry after a successful API migrate. */
export function clearLegacyLocalDirectory(projectId: string): void {
  const map = readMap();
  if (!(projectId in map)) return;
  delete map[projectId];
  writeMap(map);
}

/** Normalize project.localWorkingDirectory (or any caller-supplied path). */
export function normalizeWorkingDirectory(
  directory: string | null | undefined,
): string | null {
  const trimmed = directory?.trim() ?? "";
  return trimmed || null;
}
