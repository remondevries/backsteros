// @effect-diagnostics nodeBuiltinImport:off
/**
 * Mirror paired bearer remotes into control-environments.json so the localhost
 * control API can start agents on those environments without Electron decrypt.
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

export function writeControlEnvironmentsMirror(input: {
  readonly stateDir: string;
  readonly catalog: ConnectionCatalogDocument;
}): void {
  const filePath = path.join(input.stateDir, "control-environments.json");
  const document = {
    version: 1 as const,
    environments: controlEnvironmentsFromCatalog(input.catalog),
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
