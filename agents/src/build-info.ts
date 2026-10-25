import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AgentsBuild = {
  commit: string;
  builtAt: string;
  dirty: boolean;
};

function parseBuild(value: unknown): AgentsBuild | null {
  if (!value || typeof value !== "object") return null;
  const { commit, builtAt, dirty } = value as Record<string, unknown>;
  if (typeof commit !== "string" || !commit.trim()) return null;
  return {
    commit: commit.trim(),
    builtAt: typeof builtAt === "string" ? builtAt : "",
    dirty: dirty === true,
  };
}

/**
 * Build identity for `/health`: `BACKSTEROS_BUILD_COMMIT` (+ `_BUILT_AT`,
 * `_DIRTY`) wins, then `build-info.json` in the package root, which
 * `deploy/agents/deploy-agents.sh` writes.
 */
export function resolveAgentsBuild(
  env: NodeJS.ProcessEnv = process.env,
  buildInfoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build-info.json"),
): AgentsBuild | null {
  const fromEnv = parseBuild({
    commit: env.BACKSTEROS_BUILD_COMMIT,
    builtAt: env.BACKSTEROS_BUILD_BUILT_AT,
    dirty: env.BACKSTEROS_BUILD_DIRTY === "1" || env.BACKSTEROS_BUILD_DIRTY === "true",
  });
  if (fromEnv) return fromEnv;
  try {
    return parseBuild(JSON.parse(readFileSync(buildInfoPath, "utf8")));
  } catch {
    return null;
  }
}
