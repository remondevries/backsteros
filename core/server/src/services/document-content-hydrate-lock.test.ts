import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("hydrateLocalDocumentVaultContent row lock", () => {
  it("uses withDocumentContentRowLock before putObject (local sync path)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "documents.ts"), "utf8");
    const start = src.indexOf(
      "export async function hydrateLocalDocumentVaultContent",
    );
    assert.ok(start >= 0);
    const next = src.indexOf("\nexport async function ", start + 1);
    const fn = next >= 0 ? src.slice(start, next) : src.slice(start);

    const lockCall = fn.indexOf("withDocumentContentRowLock(");
    const putCall = fn.indexOf("putObject(");
    assert.ok(lockCall >= 0, "hydrate must take the shared row lock");
    assert.ok(putCall >= 0, "hydrate must still write vault bytes");
    assert.ok(
      lockCall < putCall,
      "local-sync hydrate putObject must run under the row lock",
    );
    assert.ok(
      fn.includes("withDocumentContentSaveTimeout("),
      "hydrate must apply the same save timeout",
    );
  });
});
