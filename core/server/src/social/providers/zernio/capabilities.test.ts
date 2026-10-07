import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { zernioCapabilities } from "./capabilities.js";

describe("zernioCapabilities", () => {
  it("marks Instagram deletePost false", () => {
    const caps = zernioCapabilities("instagram");
    assert.equal(caps.publish, true);
    assert.equal(caps.deletePost, false);
    assert.equal(caps.dms, true);
    assert.equal(caps.dmWebhooks, true);
  });

  it("marks LinkedIn personal comments/DMs off", () => {
    const caps = zernioCapabilities("linkedin_personal");
    assert.equal(caps.publish, true);
    assert.equal(caps.readComments, false);
    assert.equal(caps.dms, false);
  });

  it("marks LinkedIn page comments on, hide off, DMs off", () => {
    const caps = zernioCapabilities("linkedin_org");
    assert.equal(caps.readComments, true);
    assert.equal(caps.replyComments, true);
    assert.equal(caps.hideComments, false);
    assert.equal(caps.deleteComments, true);
    assert.equal(caps.dms, false);
  });

  it("marks YouTube publish false (manual) and comments on", () => {
    const caps = zernioCapabilities("youtube");
    assert.equal(caps.publish, false);
    assert.equal(caps.readComments, true);
    assert.equal(caps.replyComments, true);
  });

  it("marks X dmWebhooks false (poll fallback)", () => {
    const caps = zernioCapabilities("x");
    assert.equal(caps.dms, true);
    assert.equal(caps.dmWebhooks, false);
  });

  it("marks WhatsApp messaging-only", () => {
    const caps = zernioCapabilities("whatsapp");
    assert.equal(caps.publish, false);
    assert.equal(caps.dms, true);
    assert.equal(caps.dmWebhooks, true);
  });
});
