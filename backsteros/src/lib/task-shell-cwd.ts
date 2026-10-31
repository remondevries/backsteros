/**
 * Resolve the local cwd for a codebase task Terminal tab.
 *
 * Prefer Development when it is a local path, then localWorkingDirectory.
 * Callers treat `null` as “use the PTY sidecar default” ($HOME).
 */

export type TaskShellProjectLocations = {
  development?: {
    kind: "local" | "server";
    path: string;
    host?: string | null;
  } | null;
  developmentLocation?: string | null;
  localWorkingDirectory?: string | null;
};

function trimPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** Absolute or home-relative path that can be a local shell cwd. */
export function looksLikeLocalFilesystemPath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "~" || trimmed.startsWith("~/")) return true;
  if (trimmed.startsWith("/")) return true;
  // Windows drive path (unlikely on Remon’s Mac, but harmless).
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return true;
  return false;
}

/**
 * Development (local) → localWorkingDirectory → null ($HOME on the sidecar).
 * Remote Development (`kind: "server"`) is skipped — the Terminal is local-only.
 */
export function resolveTaskShellCwd(
  project: TaskShellProjectLocations | null | undefined,
): string | null {
  if (!project) return null;

  const development = project.development;
  if (development?.kind === "local") {
    const path = trimPath(development.path);
    if (path) return path;
  }

  // Legacy string field: only when it still looks like a local path.
  const developmentLocation = trimPath(project.developmentLocation);
  if (
    developmentLocation &&
    looksLikeLocalFilesystemPath(developmentLocation) &&
    development?.kind !== "server"
  ) {
    return developmentLocation;
  }

  return trimPath(project.localWorkingDirectory);
}
