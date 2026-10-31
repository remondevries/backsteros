import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import {
  EMAIL_SIGN_OFF_AVATAR_EDGE,
  renderCircularSignOffAvatarPng,
} from "./email-signoff-avatar.js";

describe("renderCircularSignOffAvatarPng", () => {
  it("returns a square PNG with transparent corners (circular crop)", async () => {
    const square = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const out = await renderCircularSignOffAvatarPng(
      new Uint8Array(square),
      EMAIL_SIGN_OFF_AVATAR_EDGE,
    );
    const meta = await sharp(Buffer.from(out)).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.width, EMAIL_SIGN_OFF_AVATAR_EDGE);
    assert.equal(meta.height, EMAIL_SIGN_OFF_AVATAR_EDGE);
    assert.equal(meta.hasAlpha, true);

    // Corner pixel must be transparent; center must be opaque red.
    const { data, info } = await sharp(Buffer.from(out))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const idx = (x: number, y: number) => (y * info.width + x) * info.channels;
    const cornerA = data[idx(0, 0) + 3] ?? 255;
    const mid = Math.floor(EMAIL_SIGN_OFF_AVATAR_EDGE / 2);
    const centerA = data[idx(mid, mid) + 3] ?? 0;
    assert.equal(cornerA, 0, "corner should be transparent");
    assert.equal(centerA, 255, "center should be opaque");
  });
});
