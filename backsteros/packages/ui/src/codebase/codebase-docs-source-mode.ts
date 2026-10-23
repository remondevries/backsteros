export const codebaseDocsSourceModes = ["repo", "local"] as const;

export type CodebaseDocsSourceMode = (typeof codebaseDocsSourceModes)[number];

export const DEFAULT_CODEBASE_DOCS_SOURCE_MODE: CodebaseDocsSourceMode = "repo";

export const CODEBASE_DOCS_SOURCE_MODE_OPTIONS: ReadonlyArray<{
  value: CodebaseDocsSourceMode;
  label: string;
  shortcut?: string;
}> = [
  { value: "repo", label: "Repo", shortcut: "1" },
  { value: "local", label: "Local", shortcut: "2" },
];

export function isCodebaseDocsSourceMode(
  value: string,
): value is CodebaseDocsSourceMode {
  return (codebaseDocsSourceModes as readonly string[]).includes(value);
}

export function parseCodebaseDocsSourceMode(
  value: string | null | undefined,
): CodebaseDocsSourceMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized && isCodebaseDocsSourceMode(normalized)) {
    return normalized;
  }
  return DEFAULT_CODEBASE_DOCS_SOURCE_MODE;
}

export function codebaseDocsSourceModeLabel(
  mode: CodebaseDocsSourceMode,
): string {
  return (
    CODEBASE_DOCS_SOURCE_MODE_OPTIONS.find((option) => option.value === mode)
      ?.label ?? "Repo"
  );
}
