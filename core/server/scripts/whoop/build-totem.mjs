/**
 * Compile @briangaoo/totem when GitHub checkout has no prebuilt dist/.
 * Safe to run from server postinstall.
 */
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);

let totemDir;
try {
  totemDir = dirname(require.resolve("@briangaoo/totem/package.json"));
} catch {
  console.warn("[build-totem] @briangaoo/totem is not installed — skipping compile");
  process.exit(0);
}

const cognitoDist = join(totemDir, "dist", "whoop", "cognito.js");
if (existsSync(cognitoDist)) {
  process.exit(0);
}

if (!existsSync(join(totemDir, "package.json"))) {
  console.warn("[build-totem] @briangaoo/totem is not installed — skipping compile");
  process.exit(0);
}

const tsconfigPath = join(totemDir, "tsconfig.json");
if (!existsSync(tsconfigPath)) {
  writeFileSync(
    tsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2024",
          module: "ESNext",
          moduleResolution: "Bundler",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          noUncheckedIndexedAccess: true,
          noImplicitOverride: true,
          exactOptionalPropertyTypes: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          declaration: false,
          sourceMap: true,
          types: ["node"],
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist", "tests"],
      },
      null,
      2,
    ),
  );
}

console.log(
  "[build-totem] Compiling @briangaoo/totem (GitHub source has no prebuilt dist)…",
);

/**
 * Whoop is an optional integration (loaded lazily at runtime with a clear
 * error when dist/ is missing). On CI the nested `npm install` is flaky under
 * pnpm's layout, so fail soft there instead of breaking the whole install.
 */
function fail(message, status) {
  if (process.env.CI) {
    console.warn(`[build-totem] ${message} — skipping on CI (Whoop disabled)`);
    process.exit(0);
  }
  console.error(`[build-totem] ${message}`);
  process.exit(status ?? 1);
}

const install = spawnSync("npm", ["install"], {
  cwd: totemDir,
  stdio: "inherit",
});
if (install.status !== 0) {
  fail("npm install failed", install.status);
}

const compile = spawnSync("npx", ["tsc"], {
  cwd: totemDir,
  stdio: "inherit",
});
if (compile.status !== 0) {
  fail("tsc failed", compile.status);
}

if (!existsSync(cognitoDist)) {
  fail("compile finished but dist/whoop/cognito.js is missing", 1);
}

console.log("[build-totem] done");
