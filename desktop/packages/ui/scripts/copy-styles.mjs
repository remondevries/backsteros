import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(root, "src");
const distRoot = join(root, "dist");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function sourceForDist(distFile) {
  const rel = relative(distRoot, distFile).replace(/\.js$/, "");
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    const candidate = join(srcRoot, rel + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function hasUseClient(sourcePath) {
  if (!sourcePath) return false;
  const head = readFileSync(sourcePath, "utf8").slice(0, 400);
  return /^["']use client["'];/m.test(head);
}

/** Restore "use client" that tsc strips from emitted JS. */
function preserveUseClientDirectives() {
  let count = 0;
  for (const distFile of walk(distRoot)) {
    if (extname(distFile) !== ".js") continue;
    const source = sourceForDist(distFile);
    if (!hasUseClient(source)) continue;
    const code = readFileSync(distFile, "utf8");
    if (code.startsWith('"use client"') || code.startsWith("'use client'")) {
      continue;
    }
    writeFileSync(distFile, `"use client";\n${code}`);
    count += 1;
  }
  console.log(`[@backsteros/ui] Restored "use client" on ${count} dist modules`);
}

/**
 * Build a react-server entry that only re-exports modules without "use client".
 * Next RSC / route handlers resolve `@backsteros/ui` to this file.
 */
function writeServerEntry() {
  const indexSource = readFileSync(join(srcRoot, "index.ts"), "utf8");
  const exportBlock =
    /export\s+(type\s+)?\{[\s\S]*?\}\s+from\s+["'](\.\/[^"']+)["'];/g;
  const lines = [];
  let match;
  while ((match = exportBlock.exec(indexSource))) {
    const isType = Boolean(match[1]);
    const fromPath = match[2]; // ./foo.js
    const sourceRel = fromPath.replace(/^\.\//, "").replace(/\.js$/, "");
    let sourceFile = null;
    for (const ext of [".tsx", ".ts"]) {
      const candidate = join(srcRoot, sourceRel + ext);
      if (existsSync(candidate)) {
        sourceFile = candidate;
        break;
      }
    }
    if (hasUseClient(sourceFile)) continue;
    // Skip component / hook paths that import React even without the directive.
    if (
      sourceRel.startsWith("components/") ||
      sourceRel.includes("/components/") ||
      /(^|\/)use-[^/]+$/.test(sourceRel) ||
      sourceRel === "client-link"
    ) {
      continue;
    }
    let block = match[0];
    // Drop type-only export blocks entirely (types come from server.d.ts).
    if (isType) continue;
    // Strip inline type re-exports (`type Foo`, `type Foo as Bar`) — invalid in .js.
    const stripped = block.replace(
      /\btype\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*,?\s*/g,
      "",
    );
    block = stripped
      .replace(/\{\s*,/g, "{ ")
      .replace(/,\s*\}/g, " }")
      .replace(/,\s*,/g, ", ");
    // Skip empty export lists after stripping types.
    if (/\{\s*\}/.test(block)) continue;
    lines.push(block);
  }

  const out = [
    "/** Auto-generated — server-safe subset of @backsteros/ui (no Client Components). */",
    ...lines,
    "",
  ].join("\n");

  mkdirSync(distRoot, { recursive: true });
  writeFileSync(join(distRoot, "server.js"), out);
  // Ambient types: point consumers at the full index types.
  writeFileSync(
    join(distRoot, "server.d.ts"),
    'export * from "./index.js";\n',
  );
  console.log(
    `[@backsteros/ui] Wrote server entry with ${lines.length} export blocks`,
  );
}

// styles: the manifest (styles.css) plus the domain files it @imports.
const stylesTarget = join(distRoot, "styles.css");
mkdirSync(dirname(stylesTarget), { recursive: true });
writeFileSync(stylesTarget, readFileSync(join(srcRoot, "styles.css")));
const stylesDirSource = join(srcRoot, "styles");
const stylesDirTarget = join(distRoot, "styles");
mkdirSync(stylesDirTarget, { recursive: true });
let styleCount = 0;
for (const file of walk(stylesDirSource)) {
  if (extname(file) !== ".css") continue;
  const target = join(stylesDirTarget, relative(stylesDirSource, file));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(file));
  styleCount += 1;
}
console.log(
  `[@backsteros/ui] Copied styles.css + ${styleCount} styles/ files to dist/`,
);

preserveUseClientDirectives();
writeServerEntry();
