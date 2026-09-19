import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const publicDir = join(projectRoot, "public");
const marker = join(publicDir, "@powersync", "worker", "WASQLiteDB.umd.js");

// Do not spawn `pnpm`. Homebrew's pnpm is a shebang-less shell script, and
// Node's spawn returns ENOEXEC on macOS before the CLI can run.
const cli = join(
  projectRoot,
  "node_modules",
  "@powersync",
  "web",
  "bin",
  "powersync.cjs",
);

if (!existsSync(cli)) {
  console.error(
    `[copy-powersync-assets] missing ${cli} — install @powersync/web`,
  );
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, "copy-assets", "-o", "public"], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error(
    "[copy-powersync-assets] powersync-web copy-assets failed — PowerSync workers may be missing",
  );
  process.exit(result.status ?? 1);
}

if (!existsSync(marker)) {
  console.error(
    "[copy-powersync-assets] WASQLiteDB.umd.js missing after copy — check @powersync/web install",
  );
  process.exit(1);
}

console.log("[copy-powersync-assets] PowerSync workers ready in public/@powersync/");
