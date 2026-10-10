import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRemoteCloneScript,
  ensureDevelopmentCheckout,
  githubSshCloneUrl,
  sanitizeCheckoutError,
} from "./development-checkout.js";

describe("development-checkout", () => {
  it("builds a github SSH clone URL from owner/repo", () => {
    assert.equal(
      githubSshCloneUrl("remondevries/backsteros"),
      "git@github.com:remondevries/backsteros.git",
    );
    assert.equal(githubSshCloneUrl("bad"), null);
  });

  it("redacts tokens from setup errors", () => {
    assert.match(
      sanitizeCheckoutError("clone failed ghp_ABCDEFG1234567890 and done"),
      /\[redacted\]/,
    );
    assert.doesNotMatch(
      sanitizeCheckoutError("https://x-access-token:secret@github.com/a/b.git"),
      /secret/,
    );
  });

  it("remote script is idempotent for existing checkouts", () => {
    const script = buildRemoteCloneScript({
      location: "/home/deploy/code/backsteros",
      cloneUrl: "git@github.com:remondevries/backsteros.git",
    });
    assert.match(script, /LOCATION='\/home\/deploy\/code\/backsteros'/);
    assert.match(script, /\.git/);
    assert.match(script, /git clone/);
    assert.match(script, /EXISTS/);
  });

  it("skips when developmentLocation is empty", async () => {
    const result = await ensureDevelopmentCheckout({
      githubRepository: "a/b",
      developmentLocation: "  ",
    });
    assert.equal(result.status, "skipped");
  });

  it("fails when githubRepository is missing", async () => {
    const result = await ensureDevelopmentCheckout({
      githubRepository: null,
      developmentLocation: "/home/deploy/code/demo",
    });
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.match(result.error, /githubRepository/i);
    }
  });

  it("reports ready when remote says EXISTS", async () => {
    const result = await ensureDevelopmentCheckout(
      {
        githubRepository: "remondevries/backsteros",
        developmentLocation: "/home/deploy/code/backsteros",
      },
      {
        exec: async () => ({ stdout: "EXISTS\n", stderr: "" }),
      },
    );
    assert.deepEqual(result, { status: "ready", skippedExisting: true });
  });

  it("reports failed with sanitized stderr", async () => {
    const result = await ensureDevelopmentCheckout(
      {
        githubRepository: "remondevries/backsteros",
        developmentLocation: "/home/deploy/code/backsteros",
      },
      {
        exec: async () => {
          const err = new Error("Command failed") as Error & { stderr: string };
          err.stderr = "Permission denied (publickey) ghp_SHOULD_NOT_LEAK\n";
          throw err;
        },
      },
    );
    assert.equal(result.status, "failed");
    if (result.status === "failed") {
      assert.match(result.error, /Permission denied/);
      assert.doesNotMatch(result.error, /ghp_/);
    }
  });
});
