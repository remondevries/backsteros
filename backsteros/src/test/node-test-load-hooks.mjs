// ESM loader hooks for desktop unit tests (registered from node-test-setup.mjs).
import { Buffer } from "node:buffer";

const ENV_GLOBAL_KEY = "__BACKSTEROS_TEST_IMPORT_META_ENV__";
const DESKTOP_SRC_SEGMENT = "/desktop/src/";

function sourceToString(source) {
  return typeof source === "string" ? source : Buffer.from(source).toString("utf8");
}

function rewriteImportMetaEnv(result) {
  if (result?.source == null) return result;
  const text = sourceToString(result.source);
  if (!text.includes("import.meta.env")) return result;
  return {
    ...result,
    source: text.replaceAll(
      "import.meta.env",
      `(globalThis.${ENV_GLOBAL_KEY})`,
    ),
  };
}

// Sync hook — do not `async`/`await nextLoad` (Node 22.23+ rejects the resolved value).
export function load(url, context, nextLoad) {
  if (url.includes("?worker")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default class WorkerStub {}",
    };
  }
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }

  const downstream = nextLoad(url, context);
  if (!url.includes(DESKTOP_SRC_SEGMENT)) {
    return downstream;
  }

  if (downstream != null && typeof downstream.then === "function") {
    return downstream.then(rewriteImportMetaEnv);
  }
  return rewriteImportMetaEnv(downstream);
}
