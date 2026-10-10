/**
 * Resolve workspace path / environment label from project locations + task
 * override (OS-106). Pure helpers — no I/O.
 */

export type ExecutionLocation = "development" | "production" | "local";

export type ProjectLocationFields = {
  readonly developmentLocation?: string | null;
  readonly productionLocation?: string | null;
  readonly localLocation?: string | null;
  /** Canonical local codebase location (existing field). */
  readonly localWorkingDirectory?: string | null;
};

export function isExecutionLocation(
  value: string | null | undefined,
): value is ExecutionLocation {
  return value === "development" || value === "production" || value === "local";
}

/**
 * Path for a given execution location. For `local`, prefers `localLocation`
 * then falls back to `localWorkingDirectory`.
 */
export function resolveExecutionWorkspacePath(
  project: ProjectLocationFields,
  executionLocation: ExecutionLocation | null | undefined,
): string | null {
  if (executionLocation === "development") {
    return trimPath(project.developmentLocation);
  }
  if (executionLocation === "production") {
    return trimPath(project.productionLocation);
  }
  if (executionLocation === "local") {
    return trimPath(project.localLocation) ?? trimPath(project.localWorkingDirectory);
  }
  // No override — keep historical default (local working directory).
  return trimPath(project.localWorkingDirectory);
}

/**
 * Control-API environment label hint for an execution location.
 * Callers match this against paired environment labels (case-insensitive).
 */
export function executionLocationEnvironmentLabel(
  executionLocation: ExecutionLocation | null | undefined,
): string | null {
  if (executionLocation === "development") return "development";
  if (executionLocation === "production") return "production";
  if (executionLocation === "local") return null;
  return null;
}

function trimPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
