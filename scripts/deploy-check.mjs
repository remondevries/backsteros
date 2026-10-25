#!/usr/bin/env node
/**
 * Is every running service on the commit at origin/production?
 *
 *   pnpm deploy:check [--json] [--fetch] [--only=local,cloud,agents] [--allow-dirty]
 *
 * Compares `git rev-parse origin/production` with the `/health` build commit
 * of local-core, cloud-core and the agents door. Exits 1 when any checked
 * target is unreachable, reports no commit, runs another commit, or (without
 * --allow-dirty) was built from a dirty tree.
 *
 * Env overrides: LOCAL_CORE_URL (http://127.0.0.1:8788),
 * CLOUD_CORE_URL (http://100.83.125.67:8788, lemodesign over Tailscale),
 * AGENTS_URL (https://agent.backsteros.com), DEPLOY_CHECK_REF (origin/production),
 * DEPLOY_CHECK_TIMEOUT_MS (5000).
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = {
  local: {
    url: process.env.LOCAL_CORE_URL ?? "http://127.0.0.1:8788",
    build: (body) => body?.version,
  },
  cloud: {
    url: process.env.CLOUD_CORE_URL ?? "http://100.83.125.67:8788",
    build: (body) => body?.version,
  },
  agents: {
    url: process.env.AGENTS_URL ?? "https://agent.backsteros.com",
    build: (body) => body?.build,
  },
};

function parseArgs(argv) {
  const options = { json: false, fetch: false, allowDirty: false, only: Object.keys(TARGETS) };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--fetch") options.fetch = true;
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg.startsWith("--only=")) {
      options.only = arg.slice("--only=".length).split(",").map((name) => name.trim()).filter(Boolean);
      const unknown = options.only.filter((name) => !(name in TARGETS));
      if (unknown.length) throw new Error(`unknown target(s): ${unknown.join(", ")}`);
    } else if (arg === "--help" || arg === "-h") {
      console.log("usage: pnpm deploy:check [--json] [--fetch] [--only=local,cloud,agents] [--allow-dirty]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

export function sameCommit(expected, actual) {
  if (!expected || !actual) return false;
  const a = expected.toLowerCase();
  const b = actual.toLowerCase();
  const shorter = Math.min(a.length, b.length);
  return shorter >= 7 && a.slice(0, shorter) === b.slice(0, shorter);
}

async function checkTarget(name, target, expected, options, timeoutMs) {
  const healthUrl = `${target.url.replace(/\/$/, "")}/health`;
  const result = { target: name, url: healthUrl, expected, commit: null, builtAt: null, dirty: null };
  let body;
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { ...result, status: "unreachable", detail: `HTTP ${response.status}` };
    body = await response.json();
  } catch (error) {
    return { ...result, status: "unreachable", detail: error instanceof Error ? error.message : String(error) };
  }
  const build = target.build(body);
  const commit = typeof build?.commit === "string" && build.commit.trim() ? build.commit.trim() : null;
  const withBuild = { ...result, commit, builtAt: build?.builtAt ?? null, dirty: build?.dirty ?? null };
  if (!commit || commit === "unknown") return { ...withBuild, status: "unknown", detail: "no build commit in /health" };
  if (!sameCommit(expected, commit)) return { ...withBuild, status: "mismatch", detail: `running ${commit.slice(0, 12)}` };
  if (build?.dirty === true && !options.allowDirty) {
    return { ...withBuild, status: "dirty", detail: "built from a dirty working tree" };
  }
  return { ...withBuild, status: "ok", detail: null };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ref = process.env.DEPLOY_CHECK_REF ?? "origin/production";
  const timeoutMs = Number(process.env.DEPLOY_CHECK_TIMEOUT_MS ?? 5000);
  if (options.fetch) git(["fetch", "--quiet", "origin", "production"]);
  const expected = git(["rev-parse", ref]);

  const results = await Promise.all(
    options.only.map((name) => checkTarget(name, TARGETS[name], expected, options, timeoutMs)),
  );
  const ok = results.every((result) => result.status === "ok");

  if (options.json) {
    console.log(JSON.stringify({ ok, ref, expected, targets: results }, null, 2));
  } else {
    console.log(`${ref} = ${expected.slice(0, 12)}`);
    for (const result of results) {
      const mark = result.status === "ok" ? "OK  " : "FAIL";
      const detail = result.detail ? ` (${result.detail})` : "";
      console.log(`  ${mark} ${result.target.padEnd(6)} ${result.status.padEnd(11)} ${result.url}${detail}`);
    }
    if (!ok) console.log("Deploy check failed: not every service runs the production commit.");
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`deploy:check: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  });
}
