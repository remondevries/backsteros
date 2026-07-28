/** Normalize a project working directory path for PTY / agent cwd. */
export function normalizeWorkingDirectory(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Resolve the PTY cwd for an agent session.
 *
 * Prefer an explicit `localWorkingDirectory` (codebase checkout or vault
 * project folder). When missing, callers should ensure the project vault and
 * pass that path — agents should not start in `~` when a project exists.
 */
export function resolveAgentWorkingDirectory(
  value: string | null | undefined,
): string | null {
  return normalizeWorkingDirectory(value);
}
