/**
 * Resolve workspace path / environment label from project locations + task
 * override (OS-106). Pure helpers — no I/O.
 */

export type ExecutionLocation = "development" | "production" | "local";

export type ProjectLocationFields = {
  readonly developmentLocation?: string | null;
  readonly productionLocation?: string | null;
  /**
   * @deprecated Folded into {@link localWorkingDirectory}. Kept optional so
   * older payloads still type-check; ignored at resolve time.
   */
  readonly localLocation?: string | null;
  /** Canonical local path (agent/PTY cwd and `executionLocation = local`). */
  readonly localWorkingDirectory?: string | null;
  /** Structured Development location (preferred over developmentLocation). */
  readonly development?: {
    readonly kind: "local" | "server";
    readonly path: string;
    readonly host?: string | null;
  } | null;
  /** Structured Production deploy target (preferred path over productionLocation). */
  readonly production?: {
    readonly path?: string | null;
  } | null;
};

export function isExecutionLocation(
  value: string | null | undefined,
): value is ExecutionLocation {
  return value === "development" || value === "production" || value === "local";
}

/**
 * Path for a given execution location. `local` (and the unset default) use
 * {@link localWorkingDirectory} only — `localLocation` was consolidated into it.
 */
export function resolveExecutionWorkspacePath(
  project: ProjectLocationFields,
  executionLocation: ExecutionLocation | null | undefined,
): string | null {
  if (executionLocation === "development") {
    return (
      trimPath(project.development?.path) ??
      trimPath(project.developmentLocation)
    );
  }
  if (executionLocation === "production") {
    return (
      trimPath(project.production?.path) ??
      trimPath(project.productionLocation)
    );
  }
  // `local` and unset both use the single canonical local working directory
  // (mirrored from development when kind=local).
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
