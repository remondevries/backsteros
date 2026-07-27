import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(scriptDir, "..");
const totemDir = join(projectRoot, "node_modules", "@briangaoo", "totem");
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

console.log("[build-totem] Compiling @briangaoo/totem (GitHub source has no prebuilt dist)…");

const install = spawnSync("npm", ["install"], {
  cwd: totemDir,
  stdio: "inherit",
});
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

const compile = spawnSync("npx", ["tsc"], {
  cwd: totemDir,
  stdio: "inherit",
});
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

if (!existsSync(cognitoDist)) {
  console.error("[build-totem] compile finished but dist/whoop/cognito.js is missing");
  process.exit(1);
}

console.log("[build-totem] done");
