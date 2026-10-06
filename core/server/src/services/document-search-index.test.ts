import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLiveBacksterosDatabaseUrl } from "./document-search-live-url.ts";

describe("isLiveBacksterosDatabaseUrl", () => {
  it("detects the live database name and ignores backsteros_test", () => {
    assert.equal(
      isLiveBacksterosDatabaseUrl(
        "postgresql://backsteros:x@127.0.0.1:5433/backsteros",
      ),
      true,
    );
    assert.equal(
      isLiveBacksterosDatabaseUrl(
        "postgresql://backsteros:x@127.0.0.1:5433/backsteros_test",
      ),
      false,
    );
    assert.equal(
      isLiveBacksterosDatabaseUrl(
        "postgresql://backsteros:x@127.0.0.1:5433/backsteros?sslmode=disable",
      ),
      true,
    );
  });
});
