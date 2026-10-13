import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const devRoot = path.resolve(scriptDir, "../../../development");
const vpBin = path.join(devRoot, "node_modules", ".bin", "vp");
const nestedScript = process.argv[2];

if (!nestedScript) {
  console.error("[@backsteros/development] missing nested script name");
  process.exit(1);
}

if (!existsSync(vpBin)) {
  console.log(
    `[@backsteros/development] skip ${nestedScript} (nested development/ not installed)`,
  );
  process.exit(0);
}

/**
 * Homebrew's `pnpm` shim is a shebang-less shell script, so spawnSync("pnpm")
 * can fail with ENOEXEC. Prefer the Node entrypoint when present.
 */
function resolvePnpmInvocation() {
  const candidates = [
    path.join(path.dirname(process.execPath), "pnpm"),
    "/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.mjs",
    "/usr/local/lib/node_modules/pnpm/bin/pnpm.mjs",
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    if (candidate.endsWith(".mjs")) {
      return { command: process.execPath, args: [candidate] };
    }
  }
  return { command: "pnpm", args: [] };
}

function run(command, args, { shell = false, cwd = process.cwd() } = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", shell, cwd });
  process.exit(result.status ?? 1);
}

const pnpm = resolvePnpmInvocation();

// Root `pnpm test` must stay a fast BacksterOS gate. The nested T3
// `vp run -r test` suite is large and often red from upstream drift. When
// touching development/, run `vp run -r test` inside development/ (AGENTS.md).
if (nestedScript === "test") {
  console.log(
    "[@backsteros/development] skip test (root gate; run vp run -r test inside development/ when you change it)",
  );
  process.exit(0);
}

// Root `pnpm typecheck` must stay green on machines with development/
// installed. `vp run -r typecheck` cannot combine `-r` with `--filter`, and
// `@t3tools/mobile` has large pre-existing typecheck noise (upstream T3
// drift). Mirror the packages `vp run -r typecheck` normally covers, minus
// mobile. When touching mobile, run `vp run --filter @t3tools/mobile typecheck`
// inside development/ (see root AGENTS.md).
if (nestedScript === "typecheck") {
  console.log(
    "[@backsteros/development] typecheck (root gate packages; excludes @t3tools/mobile — see AGENTS.md)",
  );
  run(
    vpBin,
    [
      "run",
      "--concurrency-limit",
      "2",
      "-F",
      "@t3tools/oxlint-plugin-t3code",
      "-F",
      "@t3tools/contracts",
      "-F",
      "effect-acp",
      "-F",
      "@t3tools/shared",
      "-F",
      "@t3tools/marketing",
      "-F",
      "effect-codex-app-server",
      "-F",
      "@t3tools/ssh",
      "-F",
      "@t3tools/client-runtime",
      "-F",
      "@t3tools/tailscale",
      "-F",
      "@t3tools/web",
      "typecheck",
    ],
    { cwd: devRoot },
  );
}

run(pnpm.command, [...pnpm.args, "--dir", devRoot, nestedScript], {
  shell: pnpm.args.length === 0,
});
