/** Normalize project.localWorkingDirectory (or any caller-supplied path). */
export function normalizeWorkingDirectory(
  directory: string | null | undefined,
): string | null {
  const trimmed = directory?.trim() ?? "";
  return trimmed || null;
}
