#!/usr/bin/env node
/** Lightweight status for @backsteros/design — no Docker required. */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [
  ["branding/overlay/css/backster-brand.css", "brand CSS"],
  ["branding/overlay/js/backster-brand.js", "brand JS"],
  ["branding/source/logo-small.svg", "logo-small source"],
  ["branding/bin/apply-branding.sh", "apply script"],
  ["penpot", "vendored Penpot fork"],
];

console.log("BacksterDESIGN (design/)");
for (const [rel, label] of checks) {
  const ok = existsSync(join(root, rel));
  console.log(`  ${ok ? "✓" : "·"} ${label} (${rel})`);
}
console.log(
  existsSync(join(root, "penpot"))
    ? "Fork present — build from design/penpot."
    : "Fork not vendored yet — runtime is still stock Penpot + branding overlay.",
);
