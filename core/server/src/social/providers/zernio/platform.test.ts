import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapZernioPlatform, toZernioConnectPlatform } from "./platform.js";

describe("mapZernioPlatform", () => {
  it("maps twitter to x", () => {
    assert.equal(mapZernioPlatform("twitter"), "x");
  });

  it("maps linkedin personal vs org", () => {
    assert.equal(mapZernioPlatform("linkedin"), "linkedin_personal");
    assert.equal(
      mapZernioPlatform("linkedin", "organization"),
      "linkedin_org",
    );
  });

  it("maps googlebusiness", () => {
    assert.equal(mapZernioPlatform("googlebusiness"), "google_business");
  });
});

describe("toZernioConnectPlatform", () => {
  it("maps normalized platforms back to connect path segments", () => {
    assert.equal(toZernioConnectPlatform("x"), "twitter");
    assert.equal(toZernioConnectPlatform("facebook_page"), "facebook");
    assert.equal(toZernioConnectPlatform("google_business"), "googlebusiness");
  });
});
