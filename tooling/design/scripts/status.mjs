#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const tooling = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = join(tooling, "../..");
const design = join(repo, "backsterdesign");

const checks = [
  [join(design, "frontend"), "Penpot frontend"],
  [join(design, "backend"), "Penpot backend"],
  [join(design, "branding/overlay/css/backster-brand.css"), "Backster brand CSS"],
  [join(design, "branding/bin/apply-branding.sh"), "branding apply script"],
  [join(design, "scripts/backster-dev.sh"), "local devenv wrapper"],
  [join(design, "BACKSTER.md"), "Backster entry"],
  [join(repo, "docs/19-penpot-integration.md"), "product doc"],
];

console.log("BacksterDESIGN (backsterdesign/ = Penpot fork)");
for (const [path, label] of checks) {
  console.log(`  ${existsSync(path) ? "✓" : "·"} ${label}`);
}

const readme = join(design, "BACKSTER.md");
if (existsSync(readme)) {
  const pin = readFileSync(readme, "utf8").match(/Penpot \*\*([^*]+)\*\*/);
  if (pin) console.log(`  pin: ${pin[1]}`);
}

try {
  const names = execSync("docker ps --format '{{.Names}}'", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const up = names.split("\n").some((n) => n.trim() === "penpot-devenv-ws0-main");
  console.log(
    up
      ? "  devenv: running → https://localhost:3449"
      : "  devenv: stopped (pnpm --filter @backsteros/design dev)",
  );
} catch {
  console.log("  devenv: docker not available");
}
