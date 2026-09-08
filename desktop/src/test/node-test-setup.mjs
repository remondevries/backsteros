// Test-only environment shim for running `desktop/src/**/*.test.ts` under
// Node's built-in test runner (`tsx --test`). Wired in via `--import` from the
// package.json "test" script. Not used by Vite / Tauri builds.
//
// 1. `.css` imports (pulled in transitively via the `@backsteros/ui` barrel)
//    are stubbed to an empty module — Node has no CSS loader.
// 2. `import.meta.env` (a Vite-only global) is rewritten inside desktop source
//    files to a static test env object so modules that read e.g.
//    `import.meta.env.DEV` at module top level can be imported under Node.
import { Buffer } from "node:buffer";
import { registerHooks } from "node:module";

const TEST_IMPORT_META_ENV = Object.freeze({
  DEV: false,
  PROD: true,
  MODE: "test",
  SSR: false,
  BASE_URL: "/",
});

const ENV_GLOBAL_KEY = "__BACKSTEROS_TEST_IMPORT_META_ENV__";
globalThis[ENV_GLOBAL_KEY] = TEST_IMPORT_META_ENV;

const DESKTOP_SRC_SEGMENT = "/desktop/src/";

function sourceToString(source) {
  return typeof source === "string" ? source : Buffer.from(source).toString("utf8");
}

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "export default {};" };
    }
    const result = nextLoad(url, context);
    if (!url.includes(DESKTOP_SRC_SEGMENT) || result.source == null) {
      return result;
    }
    const text = sourceToString(result.source);
    if (!text.includes("import.meta.env")) return result;
    return {
      ...result,
      source: text.replaceAll(
        "import.meta.env",
        `(globalThis.${ENV_GLOBAL_KEY})`,
      ),
    };
  },
});
