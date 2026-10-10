// @effect-diagnostics nodeBuiltinImport:off
/**
 * Mirror paired bearer remotes into control-environments.json so the localhost
 * control API can start agents on those environments without Electron decrypt.
 *
 * Catalog sync upserts paired remotes by environmentId and preserves rows that
 * exist only via PUT /api/backsteros/control/environments (BDV-60).
 */
import fs from "node:fs";
import path from "node:path";
import type { ConnectionCatalogDocument } from "@t3tools/client-runtime/platform";

export type ControlEnvironmentMirrorRecord = {
  readonly environmentId: string;
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly accessToken?: string;
};

export function controlEnvironmentsFromCatalog(
  catalog: ConnectionCatalogDocument,
): readonly ControlEnvironmentMirrorRecord[] {
  const credentialsByConnectionId = new Map(
    catalog.credentials.map((entry) => [entry.connectionId, entry.credential] as const),
  );
  const records: ControlEnvironmentMirrorRecord[] = [];

  for (const target of catalog.targets) {
    if (target._tag !== "BearerConnectionTarget") continue;
    if (catalog.disabledEnvironmentIds.includes(target.environmentId)) continue;
    const profile = catalog.profiles.find(
      (entry) =>
        entry._tag === "BearerConnectionProfile" && entry.connectionId === target.connectionId,
    );
    if (!profile || profile._tag !== "BearerConnectionProfile") continue;
    const credential = credentialsByConnectionId.get(target.connectionId);
    const accessToken =
      credential && credential._tag === "BearerConnectionCredential" ? credential.token.trim() : "";
    records.push({
      environmentId: String(target.environmentId),
      label: profile.label,
      httpBaseUrl: profile.httpBaseUrl.replace(/\/+$/, ""),
      ...(accessToken.length > 0 ? { accessToken } : {}),
    });
  }

  return records;
}

/**
 * Upsert catalog rows into the existing registry. Catalog wins on id collision;
 * ids present only in `existing` (e.g. PUT-only remotes) are kept.
 */
export function mergeControlEnvironmentMirror(input: {
  readonly existing: readonly ControlEnvironmentMirrorRecord[];
  readonly fromCatalog: readonly ControlEnvironmentMirrorRecord[];
}): readonly ControlEnvironmentMirrorRecord[] {
  const byId = new Map<string, ControlEnvironmentMirrorRecord>();
  for (const row of input.existing) {
    byId.set(row.environmentId, row);
  }
  for (const row of input.fromCatalog) {
    byId.set(row.environmentId, row);
  }
  return [...byId.values()];
}

function readExistingMirror(filePath: string): readonly ControlEnvironmentMirrorRecord[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      environments?: unknown;
    };
    if (!Array.isArray(parsed.environments)) return [];
    const rows: ControlEnvironmentMirrorRecord[] = [];
    for (const value of parsed.environments) {
      if (!value || typeof value !== "object") continue;
      const row = value as Record<string, unknown>;
      const environmentId = typeof row.environmentId === "string" ? row.environmentId.trim() : "";
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const httpBaseUrl =
        typeof row.httpBaseUrl === "string" ? row.httpBaseUrl.trim().replace(/\/+$/, "") : "";
      if (!environmentId || !label || !httpBaseUrl) continue;
      const accessToken =
        typeof row.accessToken === "string" && row.accessToken.trim().length > 0
          ? row.accessToken.trim()
          : undefined;
      rows.push({
        environmentId,
        label,
        httpBaseUrl,
        ...(accessToken ? { accessToken } : {}),
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export function writeControlEnvironmentsMirror(input: {
  readonly stateDir: string;
  readonly catalog: ConnectionCatalogDocument;
}): void {
  const filePath = path.join(input.stateDir, "control-environments.json");
  const environments = mergeControlEnvironmentMirror({
    existing: readExistingMirror(filePath),
    fromCatalog: controlEnvironmentsFromCatalog(input.catalog),
  });
  const document = {
    version: 1 as const,
    environments,
  };
  fs.mkdirSync(input.stateDir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  // Schema lint does not apply here — this is a small durable mirror written
  // with the same shape the server reads via JSON.parse.
  const encoded = `${JSON.stringify(document, null, 2)}\n`;
  fs.writeFileSync(tmpPath, encoded, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort on platforms that ignore mode bits.
  }
}
