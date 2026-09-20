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

const result = spawnSync("pnpm", ["--dir", devRoot, nestedScript], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
