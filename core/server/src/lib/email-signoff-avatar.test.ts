import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE,
  EMAIL_SIGN_OFF_AVATAR_MAX_BYTES,
  EMAIL_SIGN_OFF_AVATAR_MAX_EDGE,
  renderCircularSignOffAvatarPng,
  resolveCircularSignOffAvatarRenderEdge,
} from "./email-signoff-avatar.js";

describe("resolveCircularSignOffAvatarRenderEdge", () => {
  it("caps at 3× display and never upscales", () => {
    assert.equal(
      resolveCircularSignOffAvatarRenderEdge(1024, 1024),
      EMAIL_SIGN_OFF_AVATAR_MAX_EDGE,
    );
    assert.equal(resolveCircularSignOffAvatarRenderEdge(120, 200), 120);
    assert.equal(resolveCircularSignOffAvatarRenderEdge(80, 80), 80);
    assert.equal(
      resolveCircularSignOffAvatarRenderEdge(0, 0),
      EMAIL_SIGN_OFF_AVATAR_DISPLAY_EDGE,
    );
  });
});

describe("renderCircularSignOffAvatarPng", () => {
  it("renders Retina-sized PNG (≤288) with transparent corners from a large source", async () => {
    const square = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const out = await renderCircularSignOffAvatarPng(new Uint8Array(square));
    const meta = await sharp(Buffer.from(out)).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, EMAIL_SIGN_OFF_AVATAR_MAX_EDGE);
    assert.equal(meta.height, EMAIL_SIGN_OFF_AVATAR_MAX_EDGE);
    assert.equal(meta.hasAlpha, true);
    assert.ok(
      out.byteLength <= EMAIL_SIGN_OFF_AVATAR_MAX_BYTES,
      `expected ≤${EMAIL_SIGN_OFF_AVATAR_MAX_BYTES}B, got ${out.byteLength}`,
    );

    const { data, info } = await sharp(Buffer.from(out))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const idx = (x: number, y: number) => (y * info.width + x) * info.channels;
    const cornerA = data[idx(0, 0) + 3] ?? 255;
    const mid = Math.floor(EMAIL_SIGN_OFF_AVATAR_MAX_EDGE / 2);
    const centerA = data[idx(mid, mid) + 3] ?? 0;
    assert.equal(cornerA, 0, "corner should be transparent");
    assert.equal(centerA, 255, "center should be opaque");

    // Antialiased rim: some pixel near the edge has partial alpha.
    let foundSoft = false;
    for (let y = 0; y < info.height && !foundSoft; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const a = data[idx(x, y) + 3] ?? 0;
        if (a > 8 && a < 248) {
          foundSoft = true;
          break;
        }
      }
    }
    assert.equal(foundSoft, true, "circle rim should be antialiased");
  });

  it("never upscales a small source", async () => {
    const square = await sharp({
      create: {
        width: 72,
        height: 72,
        channels: 3,
        background: { r: 40, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const out = await renderCircularSignOffAvatarPng(new Uint8Array(square));
    const meta = await sharp(Buffer.from(out)).metadata();
    assert.equal(meta.width, 72);
    assert.equal(meta.height, 72);
  });
});
