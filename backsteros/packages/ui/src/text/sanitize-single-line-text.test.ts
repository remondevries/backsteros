import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeSingleLineText } from "./sanitize-single-line-text.js";

describe("sanitizeSingleLineText", () => {
  it("strips tabs and newlines while keeping normal spaces", () => {
    assert.equal(
      sanitizeSingleLineText("https://\texample.com"),
      "https://example.com",
    );
    assert.equal(
      sanitizeSingleLineText("hello\nworld\r\nhere"),
      "helloworldhere",
    );
    assert.equal(sanitizeSingleLineText("keep spaces ok"), "keep spaces ok");
  });
});
