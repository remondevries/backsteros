import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contactHasSocialAccounts,
  formatSocialAddressLine,
  normalizeContactSocialAccounts,
  normalizeSocialPlatform,
  primarySocialAccount,
} from "./social-contacts";

describe("normalizeContactSocialAccounts", () => {
  it("parses JSON string and drops empty entries", () => {
    assert.deepEqual(
      normalizeContactSocialAccounts(
        JSON.stringify([
          { platform: "LinkedIn", url: "https://linkedin.com/in/a" },
          { platform: "X", url: "" },
          { platform: "", url: "https://x.com/b" },
        ]),
      ),
      [{ platform: "LinkedIn", url: "https://linkedin.com/in/a" }],
    );
  });

  it("returns empty for invalid JSON", () => {
    assert.deepEqual(normalizeContactSocialAccounts("{"), []);
  });
});

describe("primarySocialAccount", () => {
  it("prefers LinkedIn then X", () => {
    assert.equal(
      primarySocialAccount([
        { platform: "GitHub", url: "https://github.com/a" },
        { platform: "X", url: "https://x.com/a" },
        { platform: "LinkedIn", url: "https://linkedin.com/in/a" },
      ])?.platform,
      "LinkedIn",
    );
    assert.equal(
      primarySocialAccount([
        { platform: "GitHub", url: "https://github.com/a" },
        { platform: "X", url: "https://x.com/a" },
      ])?.platform,
      "X",
    );
  });
});

describe("normalizeSocialPlatform", () => {
  it("maps aliases", () => {
    assert.equal(normalizeSocialPlatform("Twitter"), "x");
    assert.equal(normalizeSocialPlatform("linked-in"), "linkedin");
    assert.equal(normalizeSocialPlatform("ig"), "instagram");
  });
});

describe("contactHasSocialAccounts", () => {
  it("is true when at least one complete account exists", () => {
    assert.equal(
      contactHasSocialAccounts([
        { platform: "X", url: "https://x.com/a" },
      ]),
      true,
    );
    assert.equal(contactHasSocialAccounts([]), false);
  });
});

describe("formatSocialAddressLine", () => {
  it("joins non-empty parts with commas", () => {
    assert.equal(
      formatSocialAddressLine({
        address: "1 Main",
        city: "Amsterdam",
        postalCode: "1000",
        country: "NL",
      }),
      "1 Main, 1000 Amsterdam, NL",
    );
  });
});
