// Test-only environment shim for running `desktop/src/**/*.test.ts` under
// Node's built-in test runner (`tsx --import ./src/test/node-test-setup.mjs`).
// Wired in via `--import` from the package.json "test" script. Not used by
// Vite / Tauri builds.
//
// 1. `.css` and Vite `?worker` imports are stubbed — Node has no CSS/worker loader.
// 2. `import.meta.env` (a Vite-only global) is rewritten inside desktop source
//    files to a static test env object so modules that read e.g.
//    `import.meta.env.DEV` at module top level can be imported under Node.
import * as nodeModule from "node:module";
import { fileURLToPath } from "node:url";

const TEST_IMPORT_META_ENV = Object.freeze({
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
  BASE_URL: "/",
});

const ENV_GLOBAL_KEY = "__BACKSTEROS_TEST_IMPORT_META_ENV__";
globalThis[ENV_GLOBAL_KEY] = TEST_IMPORT_META_ENV;

const hooksUrl = new URL("./node-test-load-hooks.mjs", import.meta.url);

if (typeof nodeModule.registerHooks === "function") {
  const { load } = await import(hooksUrl);
  nodeModule.registerHooks({ load });
} else if (typeof nodeModule.register === "function") {
  nodeModule.register(fileURLToPath(hooksUrl), import.meta.url);
} else {
  throw new Error(
    "[desktop test setup] Node module hooks API unavailable (need registerHooks or register)",
  );
}
