import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPendingChatImages,
  pendingChatImagesToFileParts,
  revokePendingChatImages,
} from "./chat-composer-images.ts";

describe("createPendingChatImages", () => {
  it("builds preview URLs for image files", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", {
      type: "image/png",
    });
    const pending = createPendingChatImages([file]);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.file, file);
    assert.match(pending[0]?.previewUrl ?? "", /^blob:/);
    revokePendingChatImages(pending);
  });
});

describe("pendingChatImagesToFileParts", () => {
  it("maps drafts to ChatUi file image parts", () => {
    const file = new File([new Uint8Array([1])], "a.webp", {
      type: "image/webp",
    });
    const pending = createPendingChatImages([file]);
    const parts = pendingChatImagesToFileParts(pending);
    assert.deepEqual(parts, [
      {
        type: "file",
        url: pending[0]?.previewUrl,
        name: "a.webp",
        mimeType: "image/webp",
        kind: "image",
      },
    ]);
    revokePendingChatImages(pending);
  });
});
