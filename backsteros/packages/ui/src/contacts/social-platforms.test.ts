import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatSocialHandleInput,
  socialHandleFromUrl,
  socialUrlFromHandle,
} from "./social-platforms.js";

describe("social handles", () => {
  it("extracts and formats @handles from profile URLs", () => {
    assert.equal(
      socialHandleFromUrl("GitHub", "https://github.com/remon"),
      "remon",
    );
    assert.equal(
      formatSocialHandleInput("GitHub", "https://github.com/remon"),
      "@remon",
    );
    assert.equal(
      socialHandleFromUrl(
        "LinkedIn",
        "https://www.linkedin.com/in/remon-de-vries/",
      ),
      "remon-de-vries",
    );
  });

  it("builds full URLs from typed handles", () => {
    assert.equal(
      socialUrlFromHandle("Instagram", "@remon"),
      "https://www.instagram.com/remon",
    );
    assert.equal(
      socialUrlFromHandle("X", "remon"),
      "https://x.com/remon",
    );
    assert.equal(
      socialUrlFromHandle("Website", "example.com"),
      "https://example.com",
    );
  });

  it("treats prefix-only URLs as empty handles", () => {
    assert.equal(
      formatSocialHandleInput("GitHub", "https://github.com/"),
      "",
    );
  });
});
