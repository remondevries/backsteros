/** Canonical filename when a codebase project has no README yet. */
export const CODEBASE_PROJECT_README_FILENAME = "README.md";

export function isCodebaseProjectReadmeFileName(name: string): boolean {
  return name.trim().toLowerCase() === "readme.md";
}

/** Prefer on-disk casing from a root listing; otherwise `README.md`. */
export function resolveCodebaseProjectReadmeFileName(
  rootFileNames: readonly string[],
): string {
  const hit = rootFileNames.find(isCodebaseProjectReadmeFileName);
  return hit ?? CODEBASE_PROJECT_README_FILENAME;
}
