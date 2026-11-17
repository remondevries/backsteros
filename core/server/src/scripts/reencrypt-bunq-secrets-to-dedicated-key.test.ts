import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONFIRMED_CORE_STOPPED_PROBE_SKIP_LINE,
  confirmedCoreStoppedNotice,
  parseArgs,
} from "./reencrypt-bunq-secrets-to-dedicated-key.js";

describe("reencrypt CLI args (OS-180)", () => {
  it("parses --apply and --i-confirmed-core-stopped", () => {
    assert.deepEqual(parseArgs([]), {
      apply: false,
      confirmedCoreStopped: false,
    });
    assert.deepEqual(parseArgs(["--apply"]), {
      apply: true,
      confirmedCoreStopped: false,
    });
    assert.deepEqual(
      parseArgs(["--apply", "--i-confirmed-core-stopped"]),
      { apply: true, confirmedCoreStopped: true },
    );
  });

  it("prints a clear skip line only when both flags are used", () => {
    assert.equal(confirmedCoreStoppedNotice(false, true), null);
    assert.equal(confirmedCoreStoppedNotice(true, false), null);
    assert.equal(
      confirmedCoreStoppedNotice(true, true),
      CONFIRMED_CORE_STOPPED_PROBE_SKIP_LINE,
    );
    assert.match(
      CONFIRMED_CORE_STOPPED_PROBE_SKIP_LINE,
      /probe skipped by --i-confirmed-core-stopped/,
    );
  });
});
