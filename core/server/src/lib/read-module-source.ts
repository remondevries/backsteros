import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Source text of a module for source-shape tests. When `foo.ts` is a barrel
 * over a split `foo/` directory, the implementation files are appended so
 * assertions keep covering the whole module after move-only splits.
 */
export function readModuleSource(filePath: string, _encoding?: "utf8"): string {
  const parts = [readFileSync(filePath, "utf8")];
  const splitDir = join(dirname(filePath), basename(filePath, ".ts"));
  if (existsSync(splitDir) && statSync(splitDir).isDirectory()) {
    for (const entry of readdirSync(splitDir).sort()) {
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      parts.push(readFileSync(join(splitDir, entry), "utf8"));
    }
  }
  return parts.join("\n");
}
