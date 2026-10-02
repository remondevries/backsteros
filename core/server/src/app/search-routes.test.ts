import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Source-level guard: agent + palette search share one handler; /global-search
 * remains a real alias. Avoid importing the route module (it pulls the DB).
 */
test("OS-73 search unification: one merged handler + global-search alias", () => {
  const path = fileURLToPath(new URL("./search-routes.ts", import.meta.url));
  const src = fs.readFileSync(path, "utf8");

  assert.match(src, /export async function handleMergedSearch/);
  assert.match(src, /profile:\s*SearchProfile/);
  assert.match(src, /app\.get\("\/api\/v1\/search"/);
  assert.match(src, /app\.get\("\/api\/v1\/global-search"/);
  assert.match(
    src,
    /handleMergedSearch\(c,\s*"palette"\)/,
    "global-search must call the merged handler with palette profile",
  );
  assert.match(
    src,
    /handleMergedSearch\(c,\s*"agent"\)/,
    "canonical /search must call the merged handler with agent profile",
  );

  // No leftover separate handlers.
  assert.equal(src.includes("async function handlePaletteSearch"), false);
  assert.equal(src.includes("async function handleAgentSearch"), false);
});
