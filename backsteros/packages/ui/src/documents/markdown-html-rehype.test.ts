import assert from "node:assert/strict";
import { test } from "node:test";

import {
  markdownHtmlRehypePlugins,
  markdownHtmlRemarkRehypeOptions,
} from "./markdown-html-rehype.js";

test("markdownHtmlRehypePlugins is rehype-raw only", () => {
  assert.equal(markdownHtmlRehypePlugins.length, 1);
  assert.ok(typeof markdownHtmlRehypePlugins[0] === "function");
});

test("markdownHtmlRemarkRehypeOptions allows dangerous HTML for rehype-raw", () => {
  assert.equal(markdownHtmlRemarkRehypeOptions.allowDangerousHtml, true);
});
