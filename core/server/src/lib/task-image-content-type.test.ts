import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeTaskImageBase64,
  normalizeTaskImageMimeType,
  sniffTaskImageContentType,
} from "./task-image-content-type.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("task-image-content-type", () => {
  it("sniffs PNG/JPEG/GIF/WebP and rejects SVG", () => {
    assert.equal(sniffTaskImageContentType(PNG_1X1), "image/png");
    assert.equal(
      sniffTaskImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
      "image/jpeg",
    );
    assert.equal(
      sniffTaskImageContentType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "utf8")),
      null,
    );
    assert.equal(normalizeTaskImageMimeType("image/svg+xml"), null);
    assert.equal(normalizeTaskImageMimeType("image/jpg"), "image/jpeg");
  });

  it("decodes raw and data-URL base64", () => {
    const raw = decodeTaskImageBase64(PNG_1X1.toString("base64"));
    assert.ok(raw);
    assert.equal(sniffTaskImageContentType(raw), "image/png");

    const dataUrl = decodeTaskImageBase64(
      `data:image/png;base64,${PNG_1X1.toString("base64")}`,
    );
    assert.ok(dataUrl);
    assert.equal(sniffTaskImageContentType(dataUrl), "image/png");

    assert.equal(decodeTaskImageBase64("not-base64!!!"), null);
  });
});
