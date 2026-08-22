import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compactEmailMinimapPreview,
  deriveEmailThreadMinimapItems,
  resolveEmailThreadMinimapHasPersistentGutter,
  resolveEmailThreadMinimapHeightStyle,
  resolveEmailThreadMinimapHitStripWidth,
  resolveEmailThreadMinimapIndexFromPointer,
  resolveEmailThreadMinimapInteractiveWidth,
  resolveEmailThreadMinimapTopPercent,
} from "./email-thread-minimap.js";

describe("email thread minimap helpers", () => {
  it("sizes the rail from item count", () => {
    assert.equal(
      resolveEmailThreadMinimapHeightStyle(5),
      "min(32px, calc(100% - 2rem))",
    );
  });

  it("maps pointer Y to tick index", () => {
    assert.equal(resolveEmailThreadMinimapTopPercent(2, 5), 50);
    assert.equal(
      resolveEmailThreadMinimapIndexFromPointer({
        itemCount: 5,
        railTop: 0,
        railHeight: 100,
        pointerY: 50,
      }),
      2,
    );
  });

  it("resolves gutter and hit strip from main-column width", () => {
    assert.equal(resolveEmailThreadMinimapHasPersistentGutter(832), false);
    assert.equal(resolveEmailThreadMinimapHasPersistentGutter(1000), true);
    assert.equal(resolveEmailThreadMinimapHitStripWidth(768), 0);
    assert.equal(resolveEmailThreadMinimapHitStripWidth(1000), 40);
    assert.equal(
      resolveEmailThreadMinimapInteractiveWidth(40, true),
      "18rem",
    );
  });

  it("compacts preview text", () => {
    assert.equal(compactEmailMinimapPreview("  hello\nworld  "), "hello world");
    assert.equal(compactEmailMinimapPreview("   "), null);
  });

  it("derives one tick per email with sent/received direction", () => {
    const items = deriveEmailThreadMinimapItems([
      {
        messageId: "m1",
        subject: "Invoice",
        from: "remon@example.com",
        to: ["us@agentmail.to"],
        direction: "received",
      },
      {
        messageId: "m2",
        subject: "Re: Invoice",
        from: "us@agentmail.to",
        to: ["remon@example.com"],
        direction: "sent",
      },
    ]);
    assert.equal(items.length, 2);
    assert.equal(items[0]?.direction, "received");
    assert.equal(items[0]?.preview, "From remon@example.com");
    assert.equal(items[1]?.direction, "sent");
    assert.equal(items[1]?.preview, "To remon@example.com");
  });
});
