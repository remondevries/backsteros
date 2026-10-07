import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMAIL_WAKE_TEXT_MAX_CHARS,
  trimEmailTextForWake,
} from "./email-wake-text.js";

describe("trimEmailTextForWake", () => {
  it("strips Gmail-style quoted history", () => {
    const trimmed = trimEmailTextForWake(
      [
        "Thanks for the update — happy to proceed.",
        "",
        "On Mon, 6 Oct 2026 at 10:00 Ada Lovelace <ada@example.com> wrote:",
        "> Earlier thread with a long quote",
        "> and more history",
      ].join("\n"),
    );
    assert.equal(trimmed, "Thanks for the update — happy to proceed.");
  });

  it("strips Dutch quote markers and signatures", () => {
    const trimmed = trimEmailTextForWake(
      [
        "Akkoord, stuur de offerte door.",
        "",
        "Op 6 okt 2026 om 09:15 schreef Jan Jansen <jan@bedrijf.nl>:",
        "> Vorige mail",
        "",
        "-- ",
        "Jan Jansen",
        "CEO",
      ].join("\n"),
    );
    assert.equal(trimmed, "Akkoord, stuur de offerte door.");
  });

  it("strips > quoted lines after the new content", () => {
    const trimmed = trimEmailTextForWake(
      ["New answer here.", "", "> old line one", "> old line two"].join("\n"),
    );
    assert.equal(trimmed, "New answer here.");
  });

  it("caps length and keeps a tidy ellipsis", () => {
    const body = `${"word ".repeat(2_000)}end`;
    const trimmed = trimEmailTextForWake(body, 80);
    assert.ok(trimmed.length <= 80);
    assert.ok(trimmed.endsWith("…"));
    assert.ok(!trimmed.includes("end"));
  });

  it("uses the default max when omitted", () => {
    const body = "x".repeat(EMAIL_WAKE_TEXT_MAX_CHARS + 50);
    const trimmed = trimEmailTextForWake(body);
    assert.equal(trimmed.length, EMAIL_WAKE_TEXT_MAX_CHARS);
    assert.ok(trimmed.endsWith("…"));
  });

  it("returns empty for blank input", () => {
    assert.equal(trimEmailTextForWake("   \n  "), "");
  });
});
