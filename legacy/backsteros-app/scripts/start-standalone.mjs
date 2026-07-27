/**
 * Start the Next.js standalone server (output: "standalone").
 * `next start` is unsupported with that config — see Dockerfile CMD.
 */
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const standaloneRoot = join(projectRoot, ".next", "standalone");
const standaloneApp = join(standaloneRoot, "backsteros-app");
const serverEntry = join(standaloneApp, "server.js");
const staticSrc = join(projectRoot, ".next", "static");
const staticDest = join(standaloneApp, ".next", "static");
const publicSrc = join(projectRoot, "public");
const publicDest = join(standaloneApp, "public");

if (!existsSync(serverEntry)) {
  console.error(
    "Missing standalone build at .next/standalone/backsteros-app/server.js. Run pnpm build first.",
  );
  process.exit(1);
}

if (!existsSync(staticSrc)) {
  console.error("Missing .next/static. Run pnpm build first.");
  process.exit(1);
}

cpSync(staticSrc, staticDest, { recursive: true });
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

const child = spawn(process.execPath, ["backsteros-app/server.js"], {
  cwd: standaloneRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
