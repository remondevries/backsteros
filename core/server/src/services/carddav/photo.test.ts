import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import {
  CARDDAV_PHOTO_MAX_BYTES,
  optimizeCardDavPhoto,
  optimizeContactAvatarForStorage,
} from "./photo.js";

/** Noisy JPEG so compression cannot collapse a flat fill under the budget. */
async function bigJpeg(edge = 1600): Promise<Uint8Array> {
  const raw = Buffer.alloc(edge * edge * 3);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = (i * 17 + (i % 251)) & 0xff;
  }
  const buf = await sharp(raw, {
    raw: { width: edge, height: edge, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  return new Uint8Array(buf);
}

test("optimizeCardDavPhoto shrinks a large JPEG under the CardDAV budget", async () => {
  const input = await bigJpeg(1600);
  assert.ok(input.byteLength > CARDDAV_PHOTO_MAX_BYTES);
  const out = await optimizeCardDavPhoto(input, "image/jpeg");
  assert.ok(out);
  assert.equal(out.contentType, "image/jpeg");
  assert.ok(out.bytes.byteLength <= CARDDAV_PHOTO_MAX_BYTES);
  assert.ok(out.bytes.byteLength > 500);
  const meta = await sharp(Buffer.from(out.bytes)).metadata();
  assert.ok((meta.width ?? 9999) <= 256);
});

test("optimizeContactAvatarForStorage caps huge uploads", async () => {
  const input = await bigJpeg(2000);
  const out = await optimizeContactAvatarForStorage(input, "image/jpeg");
  assert.equal(out.contentType, "image/jpeg");
  assert.ok(out.bytes.byteLength < input.byteLength);
  const meta = await sharp(Buffer.from(out.bytes)).metadata();
  assert.ok((meta.width ?? 9999) <= 512);
  assert.ok((meta.height ?? 9999) <= 512);
});
