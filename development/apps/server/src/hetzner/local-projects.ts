// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalDate:off preferSchemaOverJson:off globalTimers:off unknownInEffectCatch:off anyUnknownInErrorContext:off catchToOrElseSucceed:off
/**
 * Local development codebases registry.
 *
 * Durable index at ~/.config/backsteros/local-projects.json, keyed by BacksterOS
 * project id. Auto-discovers folders under ~/.config/secrets/environments/<id>/
 * and merges metadata (name, key, working directory) from BacksterOS sync.
 *
 * Never stores secret values — only project identity + paths for the ops sidebar.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type LocalProjectRecord = {
  readonly projectId: string;
  readonly key: string | null;
  readonly name: string;
  readonly localWorkingDirectory: string | null;
  readonly accent: string;
  readonly initial: string;
  readonly icon: string | null;
  readonly hasSecretsFolder: boolean;
  readonly updatedAt: string;
};

type LocalProjectsFile = {
  readonly projects: LocalProjectRecord[];
};

const ACCENTS = ["#5b8def", "#3d9a6a", "#c4922a", "#7c5cbf", "#c45c5c", "#5cb8d6"] as const;

function storePath(): string {
  return path.join(os.homedir(), ".config", "backsteros", "local-projects.json");
}

function secretsEnvironmentsRoot(): string {
  return path.join(os.homedir(), ".config", "secrets", "environments");
}

function readStore(): LocalProjectsFile {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as LocalProjectsFile;
    if (!parsed || !Array.isArray(parsed.projects)) return { projects: [] };
    return {
      projects: parsed.projects
        .filter((p) => typeof p?.projectId === "string" && p.projectId.trim())
        .map(normalizeRecord),
    };
  } catch {
    return { projects: [] };
  }
}

function writeStore(data: LocalProjectsFile): void {
  const filePath = storePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function accentForId(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i += 1) {
    hash = (hash + projectId.charCodeAt(i) * (i + 1)) % 997;
  }
  return ACCENTS[hash % ACCENTS.length]!;
}

function initialFor(name: string, key: string | null): string {
  const fromKey = key?.trim()?.[0];
  if (fromKey) return fromKey.toUpperCase();
  const fromName = name.trim()[0];
  return fromName ? fromName.toUpperCase() : "?";
}

function normalizeRecord(raw: Partial<LocalProjectRecord>): LocalProjectRecord {
  const projectId = typeof raw.projectId === "string" ? raw.projectId.trim() : "";
  const key = typeof raw.key === "string" && raw.key.trim() ? raw.key.trim() : null;
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? raw.name.trim()
      : (key ?? projectId.slice(0, 8));
  return {
    projectId,
    key,
    name,
    localWorkingDirectory:
      typeof raw.localWorkingDirectory === "string" && raw.localWorkingDirectory.trim()
        ? raw.localWorkingDirectory.trim()
        : null,
    accent:
      typeof raw.accent === "string" && raw.accent.trim()
        ? raw.accent.trim()
        : accentForId(projectId),
    initial:
      typeof raw.initial === "string" && raw.initial.trim()
        ? raw.initial.trim().slice(0, 1).toUpperCase()
        : initialFor(name, key),
    icon: typeof raw.icon === "string" ? raw.icon : null,
    hasSecretsFolder: Boolean(raw.hasSecretsFolder),
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

function listSecretsProjectIds(): string[] {
  const root = secretsEnvironmentsRoot();
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .filter((id) => /^[A-Za-z0-9_-]+$/u.test(id));
  } catch {
    return [];
  }
}

export type LocalProjectSyncInput = {
  readonly projectId: string;
  readonly key?: string | null;
  readonly name?: string;
  readonly localWorkingDirectory?: string | null;
  readonly icon?: string | null;
};

/**
 * Reconcile durable registry with secrets folders + BacksterOS **codebase** metadata.
 * When enrichment is provided it is treated as the codebase allowlist — non-codebase
 * project ids (e.g. stray secrets folders) are not kept in the Local sidebar.
 */
export function syncLocalProjects(
  enrichment: readonly LocalProjectSyncInput[] = [],
): readonly LocalProjectRecord[] {
  const byId = new Map<string, LocalProjectRecord>();
  for (const existing of readStore().projects) {
    byId.set(existing.projectId, existing);
  }

  const enrichmentById = new Map<string, LocalProjectSyncInput>();
  for (const input of enrichment) {
    const projectId = input.projectId?.trim();
    if (!projectId || !/^[A-Za-z0-9_-]+$/u.test(projectId)) continue;
    enrichmentById.set(projectId, input);
  }
  const codebaseIds = new Set(enrichmentById.keys());
  const hasCodebaseAllowlist = codebaseIds.size > 0;

  const secretIds = new Set(listSecretsProjectIds());
  for (const projectId of secretIds) {
    if (hasCodebaseAllowlist && !codebaseIds.has(projectId)) continue;
    const prev = byId.get(projectId);
    if (prev) {
      byId.set(projectId, { ...prev, hasSecretsFolder: true });
    } else {
      byId.set(
        projectId,
        normalizeRecord({
          projectId,
          hasSecretsFolder: true,
        }),
      );
    }
  }

  for (const [projectId, input] of enrichmentById) {
    const prev = byId.get(projectId);
    const key = input.key !== undefined ? input.key?.trim() || null : (prev?.key ?? null);
    const name =
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : (prev?.name ?? key ?? projectId.slice(0, 8));
    const localWorkingDirectory =
      input.localWorkingDirectory !== undefined
        ? input.localWorkingDirectory?.trim() || null
        : (prev?.localWorkingDirectory ?? null);
    const icon = input.icon !== undefined ? input.icon : (prev?.icon ?? null);

    // Include codebase projects that have a local working directory,
    // even before a secrets folder exists.
    if (!secretIds.has(projectId) && !localWorkingDirectory && !prev) {
      continue;
    }

    byId.set(
      projectId,
      normalizeRecord({
        projectId,
        key,
        name,
        localWorkingDirectory,
        icon,
        ...(prev?.accent ? { accent: prev.accent } : {}),
        ...(prev?.initial ? { initial: prev.initial } : {}),
        hasSecretsFolder: secretIds.has(projectId),
        updatedAt: new Date().toISOString(),
      }),
    );
  }

  // Drop stale entries: no secrets + no cwd, or not in codebase allowlist.
  for (const [id, record] of [...byId.entries()]) {
    if (hasCodebaseAllowlist && !codebaseIds.has(id)) {
      byId.delete(id);
      continue;
    }
    const hasSecrets = secretIds.has(id);
    const next = { ...record, hasSecretsFolder: hasSecrets };
    if (!hasSecrets && !next.localWorkingDirectory) {
      byId.delete(id);
      continue;
    }
    byId.set(id, next);
  }

  const projects = [...byId.values()].sort((a, b) => {
    const ak = (a.key ?? a.name).toLowerCase();
    const bk = (b.key ?? b.name).toLowerCase();
    return ak.localeCompare(bk);
  });
  writeStore({ projects });
  return projects;
}

export function listLocalProjects(): readonly LocalProjectRecord[] {
  return syncLocalProjects([]);
}

export function getLocalProject(projectIdInput: string): LocalProjectRecord | null {
  const projectId = projectIdInput.trim();
  if (!projectId) return null;
  return listLocalProjects().find((entry) => entry.projectId === projectId) ?? null;
}
