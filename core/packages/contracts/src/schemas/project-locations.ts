import { z } from "zod";

/**
 * Project chat-room Channel — `{ uri, name? }`.
 * URI is self-describing by scheme. Known shapes:
 * - `grokbot://app/v1/agent?id=<uuid>` (Grok Bot room)
 * - `slack:<channel id>` (reserved)
 * Other schemes are stored as-is for future clients (neutral badge in UI).
 */
export const PROJECT_CHANNEL_SCHEMES = ["grokbot", "slack"] as const;
export const projectChannelSchemeSchema = z.enum(PROJECT_CHANNEL_SCHEMES);
export type ProjectChannelScheme = z.infer<typeof projectChannelSchemeSchema>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Grok Bot room deep link: `grokbot://app/v1/agent?id=<uuid>`. */
const GROKBOT_CHANNEL_RE =
  /^grokbot:\/\/app\/v1\/agent\?id=([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

/** Reserved Slack channel form: `slack:<channel id>`. */
const SLACK_CHANNEL_RE = /^slack:([A-Za-z0-9_-]{1,255})$/;

/** Any scheme:rest URI (letters/digits/+.- before first colon). */
const GENERIC_CHANNEL_URI_RE = /^[a-z][a-z0-9+.-]*:.+$/i;

export function projectChannelSchemeFromUri(
  uri: string | null | undefined,
): string | null {
  const trimmed = uri?.trim() ?? "";
  if (!trimmed) return null;
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return null;
  return trimmed.slice(0, colon).toLowerCase();
}

export function projectChannelScheme(
  value: string | null | undefined,
): ProjectChannelScheme | null {
  const scheme = projectChannelSchemeFromUri(value);
  if (scheme === "grokbot" || scheme === "slack") return scheme;
  return null;
}

export function isGrokBotChannelUri(value: string | null | undefined): boolean {
  return GROKBOT_CHANNEL_RE.test(value?.trim() ?? "");
}

export function grokBotAgentIdFromChannel(
  value: string | null | undefined,
): string | null {
  const match = GROKBOT_CHANNEL_RE.exec(value?.trim() ?? "");
  return match?.[1] ?? null;
}

/** Normalize a Channel URI string. Empty → null; invalid → null. */
export function normalizeProjectChannelUri(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const scheme = projectChannelSchemeFromUri(trimmed);
  if (!scheme) return null;
  if (scheme === "grokbot") {
    const match = GROKBOT_CHANNEL_RE.exec(trimmed);
    if (!match) return null;
    const id = match[1]!;
    if (!UUID_RE.test(id)) return null;
    return `grokbot://app/v1/agent?id=${id.toLowerCase()}`;
  }
  if (scheme === "slack") {
    const match = SLACK_CHANNEL_RE.exec(trimmed);
    if (!match) return null;
    return `slack:${match[1]}`;
  }
  if (!GENERIC_CHANNEL_URI_RE.test(trimmed) || trimmed.length > 2048) {
    return null;
  }
  return trimmed;
}

export function assertProjectChannelUri(
  value: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: "Channel URI is empty" };
  }
  const scheme = projectChannelSchemeFromUri(trimmed);
  if (!scheme) {
    return {
      ok: false,
      message: "Channel URI must include a scheme (e.g. grokbot://…)",
    };
  }
  const normalized = normalizeProjectChannelUri(trimmed);
  if (!normalized) {
    if (scheme === "grokbot") {
      return {
        ok: false,
        message:
          "Grok Bot Channel must be grokbot://app/v1/agent?id=<uuid>",
      };
    }
    if (scheme === "slack") {
      return {
        ok: false,
        message: "Slack Channel must be slack:<channel id>",
      };
    }
    return { ok: false, message: "Channel URI is invalid" };
  }
  return { ok: true, value: normalized };
}

export const projectChannelUriSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    const result = assertProjectChannelUri(value);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message,
      });
    }
  })
  .transform((value) => normalizeProjectChannelUri(value)!);

/**
 * Project chat-room Channel object.
 * Never render `uri` raw in UI — use {@link projectChannelDisplayName}.
 */
export const projectChannelSchema = z.object({
  uri: projectChannelUriSchema,
  /** Optional room display name (e.g. "BacksterOS"). */
  name: z.string().trim().max(255).nullable().optional(),
});
export type ProjectChannel = z.infer<typeof projectChannelSchema>;

export const nullableProjectChannelSchema = projectChannelSchema.nullable();

/** @deprecated Prefer {@link nullableProjectChannelSchema}. */
export const nullableProjectChannelUriSchema = nullableProjectChannelSchema;

export function normalizeProjectChannel(
  value: ProjectChannel | string | null | undefined,
): ProjectChannel | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const uri = normalizeProjectChannelUri(value);
    return uri ? { uri, name: null } : null;
  }
  const uri = normalizeProjectChannelUri(value.uri);
  if (!uri) return null;
  const name = value.name?.trim() || null;
  return { uri, name };
}

export function assertProjectChannel(
  value: unknown,
): { ok: true; value: ProjectChannel } | { ok: false; message: string } {
  if (value == null) {
    return { ok: false, message: "Channel is empty" };
  }
  if (typeof value === "string") {
    const uriResult = assertProjectChannelUri(value);
    if (!uriResult.ok) return uriResult;
    return { ok: true, value: { uri: uriResult.value, name: null } };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Channel must be { uri, name? }" };
  }
  const record = value as { uri?: unknown; name?: unknown };
  if (typeof record.uri !== "string") {
    return { ok: false, message: "Channel.uri is required" };
  }
  const uriResult = assertProjectChannelUri(record.uri);
  if (!uriResult.ok) return uriResult;
  const name =
    record.name == null || record.name === ""
      ? null
      : typeof record.name === "string"
        ? record.name.trim() || null
        : null;
  if (record.name != null && typeof record.name !== "string") {
    return { ok: false, message: "Channel.name must be a string" };
  }
  if (name != null && name.length > 255) {
    return { ok: false, message: "Channel.name is too long" };
  }
  return { ok: true, value: { uri: uriResult.value, name } };
}

/**
 * Polished label for Locations UI — never the raw URI.
 * Grok Bot → name or "Grok Bot room"; others → name or scheme label.
 */
export function projectChannelDisplayName(
  channel: ProjectChannel | null | undefined,
): string {
  if (!channel?.uri?.trim()) return "No channel";
  const name = channel.name?.trim();
  if (name) return name;
  if (isGrokBotChannelUri(channel.uri)) return "Grok Bot room";
  const scheme = projectChannelSchemeFromUri(channel.uri);
  if (!scheme) return "Channel";
  return scheme.charAt(0).toUpperCase() + scheme.slice(1);
}

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
