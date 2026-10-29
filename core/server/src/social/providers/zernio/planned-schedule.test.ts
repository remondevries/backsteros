import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  engagementWithZernioPostId,
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
