/**
 * One-time (resumable) upload of the local vault into the private R2 bucket.
 *
 *   pnpm --filter @backsteros/server vault:upload-r2
 *
 * Skips objects already in R2 with the same byte size. Does not delete remote
 * keys that are gone locally.
 */

import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { loadBacksterosR2Env } from "../lib/load-backsteros-r2-env.js";
import { headR2Object, isR2Configured, putR2Object } from "../lib/r2-object-store.js";
import { readFile } from "node:fs/promises";

loadBacksterosR2Env();

const vaultRoot = process.env.BACKSTEROS_VAULT_PATH?.trim();
if (!vaultRoot) {
  console.error("BACKSTEROS_VAULT_PATH is required");
  process.exit(1);
}
if (!isR2Configured()) {
  console.error(
    "R2 is not configured. Set BACKSTEROS_R2_* or ~/.config/secrets/backsteros-r2.env",
  );
  process.exit(1);
}

function shouldUpload(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = path.posix.basename(normalized);
  if (base === ".DS_Store" || base.startsWith("._")) return false;
  if (normalized.startsWith(".backsteros/replication/")) return false;
  if (normalized.endsWith(".md")) return true;
  if (normalized.startsWith("Letters/") && normalized.endsWith(".pdf")) return true;
  if (normalized.startsWith(".backsteros/avatars/")) return true;
  if (normalized.startsWith(".backsteros/attachments/")) return true;
  if (normalized.startsWith(".backsteros/pdfs/")) return true;
  if (normalized.startsWith(".backsteros/space-covers/")) return true;
  if (normalized.startsWith(".backsteros/finance-imports/")) return true;
  return false;
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute, root, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    if (shouldUpload(relative)) out.push(relative);
  }
}

function contentTypeFor(relativePath: string): string {
  if (relativePath.toLowerCase().endsWith(".pdf")) return "application/pdf";
  if (relativePath.toLowerCase().endsWith(".csv")) return "text/csv; charset=utf-8";
  if (relativePath.toLowerCase().endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

const files: string[] = [];
await walk(path.resolve(vaultRoot), path.resolve(vaultRoot), files);
files.sort();

let uploaded = 0;
let skipped = 0;
let failed = 0;
let done = 0;
const concurrency = 12;

async function uploadOne(relative: string): Promise<void> {
  const absolute = path.join(vaultRoot!, relative);
  const info = await stat(absolute);
  const head = await headR2Object(relative);
  if (head && head.size === info.size) {
    skipped += 1;
    return;
  }
  const bytes = await readFile(absolute);
  await putR2Object(relative, bytes, contentTypeFor(relative));
  uploaded += 1;
}

const queue = files.slice();
async function worker(): Promise<void> {
  for (;;) {
    const relative = queue.shift();
    if (!relative) return;
    try {
      await uploadOne(relative);
    } catch (error) {
      failed += 1;
      const name = error instanceof Error ? error.name : "error";
      console.error(`failed ${relative} (${name})`);
    } finally {
      done += 1;
      if (done % 200 === 0 || done === files.length) {
        console.log(
          `progress ${done}/${files.length} uploaded=${uploaded} skipped=${skipped} failed=${failed}`,
        );
      }
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

console.log(
  `vault upload done: ${uploaded} uploaded, ${skipped} already present, ${failed} failed, ${files.length} considered`,
);
if (failed > 0) process.exit(1);
