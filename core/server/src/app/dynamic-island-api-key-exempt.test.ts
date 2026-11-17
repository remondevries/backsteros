import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("Dynamic Island pair exemption (OS-181)", () => {
  it("pair route stays local and does not call api-key cloud forward", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const routes = readFileSync(join(dir, "dynamic-island-routes.ts"), "utf8");
    const localKey = readFileSync(
      join(dir, "../lib/dynamic-island-local-key.ts"),
      "utf8",
    );
    assert.equal(routes.includes("shouldForwardApiKeyAdminToCloud"), false);
    assert.equal(routes.includes("forwardApiKeyAdminToCloud"), false);
    assert.equal(localKey.includes("forwardApiKeyAdminToCloud"), false);
    assert.match(routes, /\/api\/v1\/dynamic-island\/pair/);
  });
});
