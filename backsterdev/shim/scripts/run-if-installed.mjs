import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const devRoot = path.resolve(scriptDir, "../..");
const vpBin = path.join(devRoot, "node_modules", ".bin", "vp");
const nestedScript = process.argv[2];

if (!nestedScript) {
  console.error("[@backsteros/development] missing nested script name");
  process.exit(1);
}

// A root-level `backsterdev/node_modules` (with `vp`) is not enough: the
// workspace packages themselves must be installed too, otherwise typecheck/lint
// fail with "Cannot find module '@oxlint/plugins'" / "effect/Option" etc.
// Use the per-package node_modules dirs as the "installed" marker.
const workspaceInstallMarkers = [
  path.join(devRoot, "oxlint-plugin-t3code", "node_modules"),
  path.join(devRoot, "packages", "contracts", "node_modules"),
];
const missingMarker = workspaceInstallMarkers.find((p) => !existsSync(p));

if (!existsSync(vpBin) || missingMarker) {
  const reason = !existsSync(vpBin)
    ? "nested backsterdev/ not installed"
    : `backsterdev/ workspace packages not installed: missing ${path.relative(devRoot, missingMarker)}`;
  console.log(`[@backsteros/development] skip ${nestedScript} (${reason})`);
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
// touching backsterdev/, run `vp run -r test` inside backsterdev/ (AGENTS.md).
if (nestedScript === "test") {
  console.log(
    "[@backsteros/development] skip test (root gate; run vp run -r test inside backsterdev/ when you change it)",
  );
  process.exit(0);
}

// Root `pnpm typecheck` must stay green on machines with backsterdev/
// installed. `vp run -r typecheck` cannot combine `-r` with `--filter`, and
// `@t3tools/mobile` has large pre-existing typecheck noise (upstream T3
// drift). Mirror the packages `vp run -r typecheck` normally covers, minus
// mobile. When touching mobile, run `vp run --filter @t3tools/mobile typecheck`
// inside backsterdev/ (see root AGENTS.md).
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
