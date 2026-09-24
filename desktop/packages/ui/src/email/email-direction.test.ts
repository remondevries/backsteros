import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveEmailMessageDirection } from "./email-direction.js";

test("resolveEmailMessageDirection marks our mailbox From as sent", () => {
  assert.equal(
    resolveEmailMessageDirection("Remon NL | Judith <remon@lemo-design.nl>", [
      "remon@lemo-design.nl",
      "hello@lemo-design.com",
    ]),
    "sent",
  );
});

test("resolveEmailMessageDirection marks external From as received", () => {
  assert.equal(
    resolveEmailMessageDirection(
      "Lisa Smit <lisa-smit@tryfreshlookpainting.com>",
      ["hello@lemo-design.com"],
    ),
    "received",
  );
});

test("resolveEmailMessageDirection is case-insensitive", () => {
  assert.equal(
    resolveEmailMessageDirection("Hello@Lemo-Design.Com", [
      "hello@lemo-design.com",
    ]),
    "sent",
  );
});
