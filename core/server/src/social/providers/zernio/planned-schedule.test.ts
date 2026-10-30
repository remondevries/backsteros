import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  engagementWithZernioPostId,
  extractZernioPostId,
  looksLikeZernioPostId,
  parseZernioPostIdFromEngagement,
  plannedPostTargetsLinkedIn,
} from "./planned-schedule.js";

describe("plannedPostTargetsLinkedIn", () => {
  it("is true when linkedin is among platforms", () => {
    assert.equal(plannedPostTargetsLinkedIn(["x", "linkedin"]), true);
    assert.equal(plannedPostTargetsLinkedIn(["linkedin"]), true);
  });

  it("is false otherwise", () => {
    assert.equal(plannedPostTargetsLinkedIn(["x", "instagram"]), false);
    assert.equal(plannedPostTargetsLinkedIn([]), false);
  });
});

describe("parseZernioPostIdFromEngagement", () => {
  it("reads zernioPostId", () => {
    assert.equal(
      parseZernioPostIdFromEngagement({ zernioPostId: "abc123" }),
      "abc123",
    );
  });

  it("returns null when missing", () => {
    assert.equal(parseZernioPostIdFromEngagement(null), null);
    assert.equal(parseZernioPostIdFromEngagement({}), null);
    assert.equal(parseZernioPostIdFromEngagement({ zernioPostId: "  " }), null);
  });
});

describe("engagementWithZernioPostId", () => {
  it("sets and clears zernioPostId", () => {
    assert.deepEqual(engagementWithZernioPostId(null, "post1"), {
      zernioPostId: "post1",
    });
    assert.equal(
      engagementWithZernioPostId({ zernioPostId: "post1" }, null),
      null,
    );
    assert.deepEqual(
      engagementWithZernioPostId({ likes: 1, zernioPostId: "old" }, "new"),
      { likes: 1, zernioPostId: "new" },
    );
  });
});

describe("extractZernioPostId", () => {
  it("reads nested post._id from create responses", () => {
    assert.equal(
      extractZernioPostId({
        post: { _id: "6ae3954e045b5bf01efaebe4" },
        message: "Post scheduled successfully",
      }),
      "6ae3954e045b5bf01efaebe4",
    );
  });

  it("reads top-level id", () => {
    assert.equal(extractZernioPostId({ id: "abc" }), "abc");
  });
});

describe("looksLikeZernioPostId", () => {
  it("accepts Mongo ObjectIds and rejects local nanoids", () => {
    assert.equal(looksLikeZernioPostId("6ae3954e045b5bf01efaebe4"), true);
    assert.equal(looksLikeZernioPostId("FACBrLaRFnBwYQA5Fz-ke"), false);
  });
});
