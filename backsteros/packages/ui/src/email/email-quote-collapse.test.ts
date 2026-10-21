import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findPlainTextEmailQuoteStart,
  splitPlainTextEmailQuotes,
} from "./email-quote-collapse.js";

test("splitPlainTextEmailQuotes leaves bodies without quotes alone", () => {
  const body = "Pin: 895191\n\nThanks!";
  assert.deepEqual(splitPlainTextEmailQuotes(body), {
    visible: body,
    quoted: null,
  });
  assert.equal(findPlainTextEmailQuoteStart(body), -1);
});

test("splitPlainTextEmailQuotes collapses English On…wrote headers", () => {
  const body = [
    "Pin: 895191",
    "",
    "On Wed, Oct 21, 2026 at 2:11 PM Remon wrote:",
    "> earlier",
    "> line",
  ].join("\n");

  const split = splitPlainTextEmailQuotes(body);
  assert.equal(split.visible, "Pin: 895191");
  assert.equal(
    split.quoted,
    "On Wed, Oct 21, 2026 at 2:11 PM Remon wrote:\n> earlier\n> line",
  );
});

test("splitPlainTextEmailQuotes collapses Dutch Op…schreef headers", () => {
  const body = [
    "Pin: 895191",
    "",
    "Op wo 21 okt. 2026 om 14:11 schreef Remon de Vries <remon@lemo-design.nl>:",
    "> Pin: 895191",
    ">",
    "> Op wo 14 okt. 2026 om 08:22 schreef Lars:",
    "> > earlier",
  ].join("\n");

  const split = splitPlainTextEmailQuotes(body);
  assert.equal(split.visible, "Pin: 895191");
  assert.ok(split.quoted?.startsWith("Op wo 21 okt."));
  assert.ok(split.quoted?.includes("> Pin: 895191"));
});

test("splitPlainTextEmailQuotes collapses leading > lines after new content", () => {
  const body = "Hello\n\n> quoted\n> more";
  const split = splitPlainTextEmailQuotes(body);
  assert.equal(split.visible, "Hello");
  assert.equal(split.quoted, "> quoted\n> more");
});

test("splitPlainTextEmailQuotes keeps fully-quoted bodies expanded", () => {
  const body = "> only quotes\n> here";
  assert.deepEqual(splitPlainTextEmailQuotes(body), {
    visible: body,
    quoted: null,
  });
});
