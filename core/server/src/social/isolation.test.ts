/**
 * Enforce: nothing outside providers/zernio may import Zernio client/types
 * or call zernio.com directly.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const serverSrc = fileURLToPath(new URL("..", import.meta.url));
const allowedPrefix = join(serverSrc, "social", "providers", "zernio");

const FORBIDDEN = [
  /from\s+["'].*providers\/zernio/,
  /zernio\.com/i,
  /ZernioClient/,
  /ZernioApiError/,
  /X-Zernio-/i,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

describe("social adapter isolation", () => {
  it("keeps Zernio imports inside providers/zernio (plus social-routes wiring)", () => {
    const files = walk(serverSrc);
    const violations: string[] = [];
    for (const file of files) {
      if (file.startsWith(allowedPrefix)) continue;
      // Allowed wiring surface for settings + webhook ingest.
      if (file.endsWith(`${join("app", "social-routes.ts")}`)) continue;
      // Isolation / non-provider tests may mention forbidden tokens in assertions.
      if (file.endsWith(".test.ts")) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) {
          violations.push(
            `${relative(serverSrc, file)} matches ${pattern}`,
          );
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});
