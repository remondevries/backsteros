import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveZernioCommentPostId } from "./feed-comments.js";

describe("resolveZernioCommentPostId", () => {
  it("unwraps zernio-post ids", () => {
    assert.equal(
      resolveZernioCommentPostId("zernio-post:6ae349d2efdedd51e3f301f3"),
      "6ae349d2efdedd51e3f301f3",
    );
  });

  it("unwraps platform share URNs after the account id", () => {
    assert.equal(
      resolveZernioCommentPostId(
        "zernio-platform-post:6ae33329b8797a0d6bcb2394:urn:li:share:7521563434673459200",
      ),
      "urn:li:share:7521563434673459200",
    );
  });

  it("rejects mock / unknown ids", () => {
    assert.equal(resolveZernioCommentPostId("post-1"), null);
  });
});
