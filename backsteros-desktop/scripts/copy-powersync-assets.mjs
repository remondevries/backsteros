import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const publicDir = join(projectRoot, "public");
const marker = join(publicDir, "@powersync", "worker", "WASQLiteDB.umd.js");

const result = spawnSync(
  "pnpm",
  ["exec", "powersync-web", "copy-assets", "-o", "public"],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (result.status !== 0) {
  console.warn(
    "[copy-powersync-assets] powersync-web copy-assets failed — PowerSync workers may be missing",
  );
  process.exit(0);
}

if (!existsSync(marker)) {
  console.warn(
    "[copy-powersync-assets] WASQLiteDB.umd.js missing after copy — check @powersync/web install",
  );
  process.exit(0);
}

console.log("[copy-powersync-assets] PowerSync workers ready in public/@powersync/");
