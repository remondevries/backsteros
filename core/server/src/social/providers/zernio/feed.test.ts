import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { linkedInUrnFromFeedPost, socialFeedDedupeKeys } from "./feed.js";

describe("socialFeedDedupeKeys", () => {
  it("collapses LinkedIn platform + Zernio authored ids via share URN", () => {
    const platform = socialFeedDedupeKeys({
      id: "urn:li:share:7521563434673459200",
      platformPostId: "urn:li:share:7521563434673459200",
      permalink:
        "https://www.linkedin.com/feed/update/urn:li:share:7521563434673459200",
    });
    const authored = socialFeedDedupeKeys({
      id: "6ae349d2efdedd51e3f301f3",
      platformPostId: "urn:li:share:7521563434673459200",
      permalink:
        "https://www.linkedin.com/feed/update/urn:li:share:7521563434673459200/",
    });
    const overlap = platform.filter((key) => authored.includes(key));
    assert.ok(overlap.length > 0);
  });
});

describe("linkedInUrnFromFeedPost", () => {
  it("reads the URN from a permalink", () => {
    assert.equal(
      linkedInUrnFromFeedPost({
        id: "zernio-post:abc",
        permalink:
          "https://www.linkedin.com/feed/update/urn:li:share:7521563434673459200/",
      }),
      "urn:li:share:7521563434673459200",
    );
  });

  it("reads the URN from a platform feed id", () => {
    assert.equal(
      linkedInUrnFromFeedPost({
        id: "zernio-platform-post:6ae33329b8797a0d6bcb2394:urn:li:share:7521563434673459200",
      }),
      "urn:li:share:7521563434673459200",
    );
  });
});
