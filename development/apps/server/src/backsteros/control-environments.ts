/**
 * Paired environments the localhost control API can target.
 *
 * Local is always available. Remotes are registered by the desktop/web client
 * (or PUT /api/backsteros/control/environments) so headless callers can pass
 * `environmentId` / label without holding pairing tokens themselves.
 */
import fs from "node:fs";
import path from "node:path";

export const CONTROL_ENVIRONMENTS_FILENAME = "control-environments.json";

export type ControlEnvironmentRecord = {
  readonly environmentId: string;
  readonly label: string;
  readonly httpBaseUrl: string;
  /** Present for remotes; omitted for the local environment row. */
  readonly accessToken?: string;
};

export type ControlEnvironmentPublic = {
  readonly environmentId: string;
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly local: boolean;
  readonly hasAccessToken: boolean;
};

type ControlEnvironmentsDocument = {
  readonly version: 1;
  readonly environments: readonly ControlEnvironmentRecord[];
};

function environmentsPath(stateDir: string): string {
  return path.join(stateDir, CONTROL_ENVIRONMENTS_FILENAME);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHttpBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function parseRecord(value: unknown): ControlEnvironmentRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const environmentId = asNonEmptyString(row.environmentId);
  const label = asNonEmptyString(row.label);
  const httpBaseUrl = asNonEmptyString(row.httpBaseUrl);
  if (!environmentId || !label || !httpBaseUrl) return null;
  const accessToken = asNonEmptyString(row.accessToken) ?? undefined;
  return {
    environmentId,
    label,
    httpBaseUrl: normalizeHttpBaseUrl(httpBaseUrl),
    ...(accessToken ? { accessToken } : {}),
  };
}

export function readControlEnvironments(stateDir: string): readonly ControlEnvironmentRecord[] {
  const filePath = environmentsPath(stateDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as ControlEnvironmentsDocument | unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const environments = (parsed as ControlEnvironmentsDocument).environments;
    if (!Array.isArray(environments)) return [];
    return environments
      .map(parseRecord)
      .filter((row): row is ControlEnvironmentRecord => row !== null);
  } catch {
    return [];
  }
}

export function writeControlEnvironments(
  stateDir: string,
  environments: ReadonlyArray<ControlEnvironmentRecord>,
): readonly ControlEnvironmentRecord[] {
  fs.mkdirSync(stateDir, { recursive: true });
  const normalized = environments
    .map(parseRecord)
    .filter((row): row is ControlEnvironmentRecord => row !== null);
  const byId = new Map<string, ControlEnvironmentRecord>();
  for (const row of normalized) {
    byId.set(row.environmentId, row);
  }
  const next = [...byId.values()];
  const document: ControlEnvironmentsDocument = { version: 1, environments: next };
  const filePath = environmentsPath(stateDir);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort on platforms that ignore mode bits.
  }
  return next;
}

export function upsertControlEnvironment(
  stateDir: string,
  record: ControlEnvironmentRecord,
): readonly ControlEnvironmentRecord[] {
  const existing = readControlEnvironments(stateDir);
  const next = [...existing.filter((row) => row.environmentId !== record.environmentId), record];
  return writeControlEnvironments(stateDir, next);
}

export function listControlEnvironmentsPublic(input: {
  readonly stateDir: string;
  readonly localEnvironmentId: string;
  readonly localLabel: string;
  readonly localHttpBaseUrl: string;
}): readonly ControlEnvironmentPublic[] {
  const remotes = readControlEnvironments(input.stateDir);
  const local: ControlEnvironmentPublic = {
    environmentId: input.localEnvironmentId,
    label: input.localLabel,
    httpBaseUrl: normalizeHttpBaseUrl(input.localHttpBaseUrl),
    local: true,
    hasAccessToken: false,
  };
  const remoteRows = remotes
    .filter((row) => row.environmentId !== input.localEnvironmentId)
    .map((row): ControlEnvironmentPublic => ({
      environmentId: row.environmentId,
      label: row.label,
      httpBaseUrl: row.httpBaseUrl,
      local: false,
      hasAccessToken: Boolean(row.accessToken),
    }));
  return [local, ...remoteRows];
}

export type ResolvedControlEnvironment =
  | {
      readonly kind: "local";
      readonly environmentId: string;
      readonly label: string;
    }
  | {
      readonly kind: "remote";
      readonly environmentId: string;
      readonly label: string;
      readonly httpBaseUrl: string;
      readonly accessToken: string;
    };

/**
 * Resolve an optional environment id or label. Omitting both selects local.
 * Matching is case-insensitive for labels.
 */
export function resolveControlEnvironmentTarget(input: {
  readonly stateDir: string;
  readonly localEnvironmentId: string;
  readonly localLabel: string;
  readonly environmentId?: string | null;
  readonly environmentLabel?: string | null;
}):
  | { readonly ok: true; readonly environment: ResolvedControlEnvironment }
  | { readonly ok: false; readonly error: string; readonly code: string } {
  const id = input.environmentId?.trim() || null;
  const label = input.environmentLabel?.trim() || null;
  if (!id && !label) {
    return {
      ok: true,
      environment: {
        kind: "local",
        environmentId: input.localEnvironmentId,
        label: input.localLabel,
      },
    };
  }

  const localLabelMatch =
    label !== null && label.toLowerCase() === input.localLabel.trim().toLowerCase();
  if (
    (id !== null && id === input.localEnvironmentId) ||
    (label !== null && localLabelMatch && (id === null || id === input.localEnvironmentId))
  ) {
    return {
      ok: true,
      environment: {
        kind: "local",
        environmentId: input.localEnvironmentId,
        label: input.localLabel,
      },
    };
  }

  const remotes = readControlEnvironments(input.stateDir);
  const match =
    (id !== null ? remotes.find((row) => row.environmentId === id) : undefined) ??
    (label !== null
      ? remotes.find((row) => row.label.trim().toLowerCase() === label.toLowerCase())
      : undefined);

  if (!match) {
    return {
      ok: false,
      error: id
        ? `Unknown environmentId '${id}'. GET /api/backsteros/control/environments for paired remotes.`
        : `Unknown environment label '${label}'. GET /api/backsteros/control/environments for paired remotes.`,
      code: "environment_not_found",
    };
  }

  if (!match.accessToken) {
    return {
      ok: false,
      error: `Environment '${match.label}' has no stored access token. Re-pair it in Settings → Connections or PUT /api/backsteros/control/environments with accessToken.`,
      code: "environment_token_missing",
    };
  }

  return {
    ok: true,
    environment: {
      kind: "remote",
      environmentId: match.environmentId,
      label: match.label,
      httpBaseUrl: match.httpBaseUrl,
      accessToken: match.accessToken,
    },
  };
}
