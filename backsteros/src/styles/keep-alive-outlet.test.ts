import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("keep-alive-outlet fills the stack so Director height:100% can paint", () => {
  const css = readFileSync(join(here, "app-chrome.css"), "utf8");
  assert.match(css, /\.keep-alive-outlet\s*\{/);
  assert.match(css, /position:\s*absolute/);
  assert.match(css, /inset:\s*0/);
  assert.match(css, /Start-room/);
  assert.match(
    css,
    /\.page-scroll:has\(\.meeting-room-page\)/,
    "page-scroll must flex-lock for Start room or the stack height collapses to 0",
  );
});
