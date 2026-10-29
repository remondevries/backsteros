import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSocialPostExternalReplyUrl,
  SOCIAL_LINKEDIN_FEED_FALLBACK_URL,
} from "./social-mock-data.js";

describe("getSocialPostExternalReplyUrl", () => {
  it("prefers the post permalink", () => {
    assert.equal(
      getSocialPostExternalReplyUrl({
        platform: "linkedin",
        permalink:
          "https://www.linkedin.com/feed/update/urn:li:share:123/",
      }),
      "https://www.linkedin.com/feed/update/urn:li:share:123/",
    );
  });

  it("falls back to LinkedIn feed when permalink is missing", () => {
    assert.equal(
      getSocialPostExternalReplyUrl({ platform: "linkedin" }),
      SOCIAL_LINKEDIN_FEED_FALLBACK_URL,
    );
  });

  it("returns null for other platforms without a permalink", () => {
    assert.equal(
      getSocialPostExternalReplyUrl({ platform: "x" }),
      null,
    );
  });
});
