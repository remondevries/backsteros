/** Canonical filename written when a codebase project has no README yet. */
export const CODEBASE_PROJECT_README_FILENAME = "README.md";

export function isCodebaseProjectReadmeFileName(name: string): boolean {
  return name.trim().toLowerCase() === "readme.md";
}

/**
 * Prefer the on-disk casing from a root listing; otherwise `README.md`.
 * Overview for `type === "codebase"` uses this file as the project description.
 */
export function resolveCodebaseProjectReadmeFileName(
  rootFileNames: readonly string[],
): string {
  const hit = rootFileNames.find(isCodebaseProjectReadmeFileName);
  return hit ?? CODEBASE_PROJECT_README_FILENAME;
}
