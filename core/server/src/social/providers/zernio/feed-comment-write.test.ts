import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveZernioCommentPostId } from "./feed-comments.js";

describe("resolveZernioCommentPostId for comment writes", () => {
  it("reads zernio-post ids", () => {
    assert.equal(
      resolveZernioCommentPostId("zernio-post:6ae3954e045b5bf01efaebe4"),
      "6ae3954e045b5bf01efaebe4",
    );
  });

  it("reads platform post ids", () => {
    assert.equal(
      resolveZernioCommentPostId(
        "zernio-platform-post:6ae33329b8797a0d6bcb2394:urn:li:share:123",
      ),
      "urn:li:share:123",
    );
  });
});
