/**
 * One-off diagnostic: compare documents.byte_size vs on-disk vault files.
 * Usage: tsx --env-file=.env src/scripts/vault-reconcile-check.ts
 */
import { stat } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import { resolveVaultPath } from "../lib/storage.js";

async function main() {
  const vault = await resolveVaultPath();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");

  const sql = postgres(connectionString, { max: 1 });
  const rows = await sql<{
    id: string;
    storage_key: string;
    byte_size: number;
    path: string;
    type: string;
  }[]>`
    SELECT id, storage_key, byte_size, path, type
    FROM documents
    WHERE deleted_at IS NULL AND byte_size > 0
  `;

  let missing = 0;
  let present = 0;
  let sizeMismatch = 0;
  const missingSamples: Array<{
    path: string;
    key: string;
    bytes: number;
    type: string;
  }> = [];

  for (const row of rows) {
    const abs = path.join(vault, row.storage_key);
    try {
      const info = await stat(abs);
      if (info.size === 0 && row.byte_size > 0) sizeMismatch += 1;
      else present += 1;
    } catch {
      missing += 1;
      if (missingSamples.length < 12) {
        missingSamples.push({
          path: row.path,
          key: row.storage_key,
          bytes: row.byte_size,
          type: row.type,
        });
      }
    }
  }

  const vaultMd = await countMarkdown(vault);

  console.log(
    JSON.stringify(
      {
        vault,
        documentsWithBytes: rows.length,
        filesPresent: present,
        filesMissing: missing,
        zeroSizeOnDisk: sizeMismatch,
        vaultMarkdownFiles: vaultMd,
        missingSamples,
      },
      null,
      2,
    ),
  );

  await sql.end();
}

async function countMarkdown(root: string): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith("._") || entry.name === ".DS_Store") continue;
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) count += 1;
    }
  }
  try {
    await walk(root);
  } catch {
    // vault root missing
  }
  return count;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
