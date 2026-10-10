/** Pure helpers mirroring core OS-106 execution-location resolution. */

export type ExecutionLocation = "development" | "production" | "local";

export type ProjectLocationFields = {
  readonly developmentLocation?: string | null;
  readonly productionLocation?: string | null;
  readonly localLocation?: string | null;
  readonly localWorkingDirectory?: string | null;
};

export function isExecutionLocation(value: string | null | undefined): value is ExecutionLocation {
  return value === "development" || value === "production" || value === "local";
}

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
  return trimPath(project.localWorkingDirectory);
}

export function executionLocationEnvironmentLabel(
  executionLocation: ExecutionLocation | null | undefined,
): string | null {
  if (executionLocation === "development") return "development";
  if (executionLocation === "production") return "production";
  return null;
}

function trimPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
