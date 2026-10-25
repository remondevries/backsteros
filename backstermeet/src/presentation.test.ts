import assert from "node:assert/strict";
import test from "node:test";

import {
  getPresentationDeliveryMode,
  isPresentationDeliveryMode,
  isPresentationKind,
  PRESENTATION_KINDS,
  PRESENTATION_LABELS,
  presentationUsesUrlSync,
} from "./presentation";
import { normalizePresentationUrl, presentationUrlForDisplay } from "./presentation-url";

test("presentation kinds and delivery modes", () => {
  for (const kind of PRESENTATION_KINDS) {
    assert.equal(isPresentationKind(kind), true);
    assert.ok(PRESENTATION_LABELS[kind]);
  }
  assert.equal(isPresentationKind("iframe"), false);
  assert.equal(isPresentationKind(null), false);

  assert.equal(isPresentationDeliveryMode("iframe"), true);
  assert.equal(isPresentationDeliveryMode("viewport"), true);
  assert.equal(isPresentationDeliveryMode("local"), false);

  assert.equal(getPresentationDeliveryMode("local"), "iframe");
  assert.equal(getPresentationDeliveryMode("screenshare"), "viewport");
  assert.equal(getPresentationDeliveryMode(null), null);

  assert.equal(presentationUsesUrlSync("local"), true);
  assert.equal(presentationUsesUrlSync("screenshare"), false);
  assert.equal(presentationUsesUrlSync(null), false);
});

test("normalizePresentationUrl adds https and rejects non-web URLs", () => {
  assert.equal(normalizePresentationUrl("  example.com/deck "), "https://example.com/deck");
  assert.equal(normalizePresentationUrl("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(normalizePresentationUrl("HTTPS://Example.com"), "https://example.com/");
  assert.equal(normalizePresentationUrl(""), null);
  assert.equal(normalizePresentationUrl("   "), null);
  assert.equal(normalizePresentationUrl("https://exa mple.com"), null);
  assert.equal(normalizePresentationUrl("javascript:alert(1)"), null);

  assert.equal(presentationUrlForDisplay(" https://example.com "), "https://example.com");
  assert.equal(presentationUrlForDisplay(null), "");
});
