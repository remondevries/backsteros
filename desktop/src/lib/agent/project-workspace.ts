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
 * Uses the project path when set; otherwise `null` so the PTY sidecar
 * starts in the user home directory (`~`).
 */
export function resolveAgentWorkingDirectory(
  value: string | null | undefined,
): string | null {
  return normalizeWorkingDirectory(value);
}
