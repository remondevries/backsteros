import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TOTEM_DIST_ROOT = join(
  process.cwd(),
  "node_modules",
  "@briangaoo",
  "totem",
  "dist",
);

const TOTEM_DIST_MARKER = join(TOTEM_DIST_ROOT, "whoop", "cognito.js");

export function getTotemDistFilePath(...relativePath: string[]): string {
  return join(TOTEM_DIST_ROOT, ...relativePath);
}

function runTotemBuildScript(): boolean {
  const buildScript = join(process.cwd(), "scripts", "build-totem.mjs");
  if (!existsSync(buildScript)) {
    return false;
  }

  const result = spawnSync("node", [buildScript], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return result.status === 0 && existsSync(TOTEM_DIST_MARKER);
}

export function ensureTotemDistBuilt(): void {
  if (existsSync(TOTEM_DIST_MARKER)) {
    return;
  }

  if (runTotemBuildScript()) {
    return;
  }

  throw new Error(
    "Whoop totem dist is not built. Run `node scripts/build-totem.mjs` or `npm install`.",
  );
}

export async function importTotemModule<T = Record<string, unknown>>(
  ...relativePath: string[]
): Promise<T> {
  ensureTotemDistBuilt();
  const filePath = getTotemDistFilePath(...relativePath);
  const href = pathToFileURL(filePath).href;
  return import(href) as Promise<T>;
}
