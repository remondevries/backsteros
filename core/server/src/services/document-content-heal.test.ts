import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diskContentNeedsMetadataHeal } from "./document-content-heal.js";

describe("diskContentNeedsMetadataHeal", () => {
  it("heals when metadata says empty but disk has bytes", () => {
    assert.equal(
      diskContentNeedsMetadataHeal({
        rowByteSize: 0,
        rowChecksum: null,
        diskByteSize: 42,
        diskChecksum: "abc",
      }),
      true,
    );
  });

  it("heals when checksum drifted", () => {
    assert.equal(
      diskContentNeedsMetadataHeal({
        rowByteSize: 10,
        rowChecksum: "old",
        diskByteSize: 10,
        diskChecksum: "new",
      }),
      true,
    );
  });

  it("heals when byte size drifted", () => {
    assert.equal(
      diskContentNeedsMetadataHeal({
        rowByteSize: 10,
        rowChecksum: "same",
        diskByteSize: 20,
        diskChecksum: "same",
      }),
      true,
    );
  });

  it("does not heal when row and disk match", () => {
    assert.equal(
      diskContentNeedsMetadataHeal({
        rowByteSize: 10,
        rowChecksum: "abc",
        diskByteSize: 10,
        diskChecksum: "abc",
      }),
      false,
    );
  });

  it("does not heal empty disk over nonempty row (empty-over-nonempty)", () => {
    assert.equal(
      diskContentNeedsMetadataHeal({
        rowByteSize: 120,
        rowChecksum: "abc",
        diskByteSize: 0,
        diskChecksum: null,
      }),
      false,
    );
  });

  it("does not heal when both empty", () => {
    assert.equal(
      diskContentNeedsMetadataHeal({
        rowByteSize: 0,
        rowChecksum: null,
        diskByteSize: 0,
        diskChecksum: null,
      }),
      false,
    );
  });
});
