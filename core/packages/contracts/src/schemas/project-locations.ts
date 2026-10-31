import { z } from "zod";

/** Where Development work happens: this Mac, or a remote server. */
export const PROJECT_DEVELOPMENT_KINDS = ["local", "server"] as const;
export const projectDevelopmentKindSchema = z.enum(PROJECT_DEVELOPMENT_KINDS);
export type ProjectDevelopmentKind = z.infer<typeof projectDevelopmentKindSchema>;

/**
 * Codebase Development location.
 * - `local`: Mac/agent cwd path (mirrors `localWorkingDirectory`).
 * - `server`: remote host + path agents use for development execution.
 */
export const projectDevelopmentSchema = z.object({
  kind: projectDevelopmentKindSchema,
  /** Absolute path (local folder or remote checkout). */
  path: z.string().trim().min(1).max(4096),
  /** Host / server name when `kind = server` (e.g. `development`). */
  host: z.string().trim().max(255).nullable().optional(),
});
export type ProjectDevelopment = z.infer<typeof projectDevelopmentSchema>;

/**
 * Codebase Production deploy target (agents read this to know where/how to deploy).
 * At least one field must be set when non-null.
 */
export const projectProductionSchema = z
  .object({
    /** Server / environment name (e.g. `lemodesign/production`). */
    server: z.string().trim().max(255).nullable().optional(),
    /** Public or deploy URL. */
    url: z.string().trim().max(2048).nullable().optional(),
    /** Deploy method (e.g. Kamal, Forge, script). */
    deployMethod: z.string().trim().max(128).nullable().optional(),
    /** Git branch to deploy. */
    branch: z.string().trim().max(255).nullable().optional(),
    /** Absolute path on the production host (agent execution cwd). */
    path: z.string().trim().max(4096).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const hasAny = [
      value.server,
      value.url,
      value.deployMethod,
      value.branch,
      value.path,
    ].some((entry) => typeof entry === "string" && entry.trim().length > 0);
    if (!hasAny) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Production location needs at least one field",
      });
    }
  });
export type ProjectProduction = z.infer<typeof projectProductionSchema>;

export const nullableProjectDevelopmentSchema =
  projectDevelopmentSchema.nullable();
export const nullableProjectProductionSchema =
  projectProductionSchema.nullable();

/** Normalize empty optional strings to null; drop empty production → null. */
export function normalizeProjectDevelopment(
  value: ProjectDevelopment | null | undefined,
): ProjectDevelopment | null {
  if (value == null) return null;
  const path = value.path.trim();
  if (!path) return null;
  const host =
    value.kind === "server"
      ? value.host?.trim()
        ? value.host.trim()
        : null
      : null;
  return {
    kind: value.kind,
    path,
    ...(host != null ? { host } : value.kind === "server" ? { host: null } : {}),
  };
}

export function normalizeProjectProduction(
  value: ProjectProduction | null | undefined,
): ProjectProduction | null {
  if (value == null) return null;
  const next: ProjectProduction = {
    server: value.server?.trim() || null,
    url: value.url?.trim() || null,
    deployMethod: value.deployMethod?.trim() || null,
    branch: value.branch?.trim() || null,
    path: value.path?.trim() || null,
  };
  const hasAny = [
    next.server,
    next.url,
    next.deployMethod,
    next.branch,
    next.path,
  ].some((entry) => entry != null && entry.length > 0);
  return hasAny ? next : null;
}

/**
 * Compat mirrors for legacy string columns.
 * - `localWorkingDirectory`: Development path when `kind=local`; otherwise keep previous.
 * - `developmentLocation` / `productionLocation`: path fields for OS-106 resolvers.
 */
export function mirrorProjectLocationCompat(input: {
  development: ProjectDevelopment | null;
  production: ProjectProduction | null;
  previousLocalWorkingDirectory?: string | null;
}): {
  localWorkingDirectory: string | null;
  developmentLocation: string | null;
  productionLocation: string | null;
} {
  const previous = input.previousLocalWorkingDirectory?.trim() || null;
  const localWorkingDirectory =
    input.development?.kind === "local"
      ? input.development.path
      : previous;
  return {
    localWorkingDirectory,
    developmentLocation: input.development?.path?.trim() || null,
    productionLocation: input.production?.path?.trim() || null,
  };
}

/**
 * Build Development from legacy columns (migration / inbound legacy writes).
 * Prefer structured `development` when present.
 */
export function developmentFromLegacyLocations(input: {
  development?: ProjectDevelopment | null;
  localWorkingDirectory?: string | null;
  developmentLocation?: string | null;
}): ProjectDevelopment | null {
  if (input.development !== undefined) {
    return normalizeProjectDevelopment(input.development);
  }
  const local = input.localWorkingDirectory?.trim() || null;
  const remote = input.developmentLocation?.trim() || null;
  if (local && remote && local !== remote) {
    // Ambiguous: keep Mac as local Development (callers resolve conflicts).
    return { kind: "local", path: local };
  }
  if (local) return { kind: "local", path: local };
  if (remote) return { kind: "server", path: remote, host: null };
  return null;
}

export function productionFromLegacyLocations(input: {
  production?: ProjectProduction | null;
  productionLocation?: string | null;
}): ProjectProduction | null {
  if (input.production !== undefined) {
    return normalizeProjectProduction(input.production);
  }
  const path = input.productionLocation?.trim() || null;
  return path ? { path, server: null, url: null, deployMethod: null, branch: null } : null;
}
