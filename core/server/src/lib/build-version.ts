import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type BuildVersion = {
  commit: string;
  builtAt: string;
  dirty: boolean;
};

type BuildInfoFile = {
  commit?: unknown;
  builtAt?: unknown;
  dirty?: unknown;
};

const UNKNOWN_COMMIT = "unknown";

function trimOrEmpty(value: string | undefined | null): string {
  return (value ?? "").trim();
}

function parseDirty(raw: string | undefined): boolean | null {
  const value = trimOrEmpty(raw).toLowerCase();
  if (!value) return null;
  if (value === "1" || value === "true" || value === "yes" || value === "dirty") {
    return true;
  }
  if (value === "0" || value === "false" || value === "no" || value === "clean") {
    return false;
  }
  return null;
}

function readBuildInfoFile(filePath: string): BuildVersion | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as BuildInfoFile;
    const commit = typeof raw.commit === "string" ? raw.commit.trim() : "";
    const builtAt = typeof raw.builtAt === "string" ? raw.builtAt.trim() : "";
    if (!commit || !builtAt) return null;
    return {
      commit,
      builtAt,
      dirty: Boolean(raw.dirty),
    };
  } catch {
    return null;
  }
}

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
  } catch {
    return null;
  }
}

function resolveRepoRoot(): string | null {
  const fromEnv = trimOrEmpty(process.env.BACKSTEROS_REPO_ROOT);
  if (fromEnv && existsSync(path.join(fromEnv, "pnpm-workspace.yaml"))) {
    return fromEnv;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  // core/server/src/lib → repo root
  const candidate = path.resolve(here, "../../../..");
  if (existsSync(path.join(candidate, "pnpm-workspace.yaml"))) {
    return candidate;
  }
  return null;
}

function fromGit(repoRoot: string): BuildVersion | null {
  const commit = git(["rev-parse", "HEAD"], repoRoot);
  if (!commit) return null;
  const status = git(["status", "--porcelain"], repoRoot);
  const dirty = status !== null && status.length > 0;
  // Prefer committer date of HEAD so rebuilt trees without a stamp still
  // report a stable builtAt for that commit.
  const commitDate =
    git(["show", "-s", "--format=%cI", "HEAD"], repoRoot) ||
    new Date().toISOString();
  return { commit, builtAt: commitDate, dirty };
}

let cached: BuildVersion | null = null;

/**
 * Resolve the running core's build identity.
 *
 * Precedence: env (`BACKSTEROS_BUILD_*`) → `build-info.json` beside the
 * server package → git in `BACKSTEROS_REPO_ROOT` / monorepo root → unknown.
 */
export function resolveBuildVersion(
  env: NodeJS.ProcessEnv = process.env,
  options: { forceRefresh?: boolean } = {},
): BuildVersion {
  if (cached && !options.forceRefresh) {
    return cached;
  }

  const envCommit = trimOrEmpty(env.BACKSTEROS_BUILD_COMMIT);
  const envBuiltAt = trimOrEmpty(env.BACKSTEROS_BUILD_BUILT_AT);
  const envDirty = parseDirty(env.BACKSTEROS_BUILD_DIRTY);
  if (envCommit && envBuiltAt && envDirty !== null) {
    cached = { commit: envCommit, builtAt: envBuiltAt, dirty: envDirty };
    return cached;
  }

  const serverRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const fromFile =
    readBuildInfoFile(path.join(serverRoot, "build-info.json")) ||
    readBuildInfoFile(path.join(serverRoot, "dist", "build-info.json"));
  if (fromFile) {
    cached = {
      commit: envCommit || fromFile.commit,
      builtAt: envBuiltAt || fromFile.builtAt,
      dirty: envDirty ?? fromFile.dirty,
    };
    return cached;
  }

  const repoRoot = resolveRepoRoot();
  if (repoRoot) {
    const fromRepo = fromGit(repoRoot);
    if (fromRepo) {
      cached = {
        commit: envCommit || fromRepo.commit,
        builtAt: envBuiltAt || fromRepo.builtAt,
        dirty: envDirty ?? fromRepo.dirty,
      };
      return cached;
    }
  }

  cached = {
    commit: envCommit || UNKNOWN_COMMIT,
    builtAt: envBuiltAt || new Date(0).toISOString(),
    dirty: envDirty ?? true,
  };
  return cached;
}

/** Test helper — drop the process-wide cache. */
export function resetBuildVersionCacheForTests(): void {
  cached = null;
}

export function shortCommit(commit: string, length = 12): string {
  const trimmed = commit.trim();
  if (!trimmed || trimmed === UNKNOWN_COMMIT) return trimmed || UNKNOWN_COMMIT;
  return trimmed.slice(0, length);
}
