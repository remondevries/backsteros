import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://backsteros:backsteros@127.0.0.1:5433/backsteros_test";

const { decodeTaskImageUpload } = await import("../services/task-images.js");
const {
  sniffTaskImageContentType,
  normalizeTaskImageMimeType,
} = await import("../lib/task-image-content-type.js");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("OS-90 task image upload decoding", () => {
  it("accepts JSON base64 PNG payloads", () => {
    const decoded = decodeTaskImageUpload({
      data: PNG_1X1.toString("base64"),
      contentType: "image/png",
      filename: "shot.png",
      alt: "bug",
    });
    assert.ok(!("error" in decoded));
    assert.equal(decoded.contentType, "image/png");
    assert.equal(decoded.alt, "bug");
  });

  it("rejects SVG bytes and svg mime fallback", () => {
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    assert.equal(sniffTaskImageContentType(svg), null);
    assert.equal(normalizeTaskImageMimeType("image/svg+xml"), null);
    const decoded = decodeTaskImageUpload({
      data: svg.toString("base64"),
      contentType: "image/svg+xml",
    });
    assert.ok("error" in decoded);
  });

  it("rejects oversized decoded payloads", () => {
    // 10 MB + 1 of zeros is valid base64 length-wise but over the byte cap.
    const tooBig = Buffer.alloc(10_000_001, 0xff);
    // Pretend JPEG magic so type check passes first.
    tooBig[0] = 0xff;
    tooBig[1] = 0xd8;
    tooBig[2] = 0xff;
    const decoded = decodeTaskImageUpload({
      data: tooBig.toString("base64"),
      contentType: "image/jpeg",
    });
    assert.ok("error" in decoded);
  });
});
