import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("local core Postgres publish", () => {
  it("binds host port 5433 to loopback and does not hardcode the default password", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const compose = readFileSync(
      join(here, "../../../../docker-compose.yml"),
      "utf8",
    );
    assert.match(compose, /"127\.0\.0\.1:5433:5432"/);
    assert.doesNotMatch(
      compose,
      /^\s+POSTGRES_PASSWORD:\s+backsteros\s*$/m,
    );
    assert.match(compose, /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:-backsteros\}/);
  });

  it("starts PowerSync when live containers already exist", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const lib = readFileSync(
      join(here, "../../../../scripts/local-core/lib.sh"),
      "utf8",
    );
    assert.match(
      lib,
      /docker start backsteros-postgres backsteros-powersync-mongo backsteros-powersync/,
    );
  });
});
