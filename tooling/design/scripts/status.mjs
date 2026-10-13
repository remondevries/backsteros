#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const tooling = dirname(dirname(fileURLToPath(import.meta.url)));
const design = join(tooling, "../../design");

const checks = [
  ["frontend", "Penpot frontend"],
  ["backend", "Penpot backend"],
  ["branding/overlay/css/backster-brand.css", "Backster brand CSS"],
  ["branding/bin/apply-branding.sh", "branding apply script"],
  ["BACKSTER.md", "Backster entry"],
  ["../docs/18-backsterdesign.md", "product doc"],
];

console.log("BacksterDESIGN (design/ = Penpot fork)");
for (const [rel, label] of checks) {
  const path = rel.startsWith("../")
    ? join(design, rel)
    : join(design, rel);
  // docs path is relative to design -> repo docs
  const resolved =
    rel === "../docs/18-backsterdesign.md"
      ? join(design, "..", "docs", "18-backsterdesign.md")
      : join(design, rel);
  console.log(`  ${existsSync(resolved) ? "✓" : "·"} ${label}`);
}

const readme = join(design, "BACKSTER.md");
if (existsSync(readme)) {
  const pin = readFileSync(readme, "utf8").match(/Penpot \*\*([^*]+)\*\*/);
  if (pin) console.log(`  pin: ${pin[1]}`);
}
