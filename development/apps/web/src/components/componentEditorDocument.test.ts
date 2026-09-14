import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  COMPONENT_EDITOR_DEFAULT_APPEARANCE,
  COMPONENT_EDITOR_DEFAULT_CANVAS,
  COMPONENT_EDITOR_DEFAULT_CSS,
  COMPONENT_EDITOR_DEFAULT_HTML,
  composeComponentEditorDocument,
  normalizeComponentEditorCanvasColor,
  parseComponentEditorDocument,
} from "./componentEditorDocument";

describe("componentEditorDocument", () => {
  it("round-trips html, css, framework, canvas, and appearance", () => {
    const html = COMPONENT_EDITOR_DEFAULT_HTML.trimEnd();
    const css = COMPONENT_EDITOR_DEFAULT_CSS.trimEnd();
    const composed = composeComponentEditorDocument(html, css, "tailwind", "#ff9600", "light");
    const parsed = parseComponentEditorDocument(composed);
    assert.equal(parsed.html, html);
    assert.equal(parsed.css, css);
    assert.equal(parsed.framework, "tailwind");
    assert.equal(parsed.canvas, "#ff9600");
    assert.equal(parsed.appearance, "light");
    assert.match(composed, /@tailwindcss\/browser@4/);
    assert.match(composed, /background-color:#ff9600/);
    assert.match(composed, /class="light"/);
    assert.match(composed, /color-scheme:light/);
    assert.match(composed, /id="component-editor-stage"/);
  });

  it("omits the Tailwind CDN for vanilla CSS and defaults canvas/appearance", () => {
    const composed = composeComponentEditorDocument("<p>hi</p>", "p { color: red; }", "vanilla");
    assert.doesNotMatch(composed, /@tailwindcss\/browser/);
    assert.equal(parseComponentEditorDocument(composed).framework, "vanilla");
    assert.equal(parseComponentEditorDocument(composed).canvas, COMPONENT_EDITOR_DEFAULT_CANVAS);
    assert.equal(
      parseComponentEditorDocument(composed).appearance,
      COMPONENT_EDITOR_DEFAULT_APPEARANCE,
    );
    assert.match(composed, /class="dark"/);
    assert.match(composed, /background-color:#0a0a0a/);
  });

  it("falls back to defaults when markers are missing", () => {
    const parsed = parseComponentEditorDocument("<html><body>plain</body></html>");
    assert.equal(parsed.html, COMPONENT_EDITOR_DEFAULT_HTML.trimEnd());
    assert.equal(parsed.css, COMPONENT_EDITOR_DEFAULT_CSS.trimEnd());
    assert.equal(parsed.framework, "vanilla");
    assert.equal(parsed.canvas, COMPONENT_EDITOR_DEFAULT_CANVAS);
    assert.equal(parsed.appearance, COMPONENT_EDITOR_DEFAULT_APPEARANCE);
  });

  it("normalizes legacy canvas names and short hex", () => {
    assert.equal(normalizeComponentEditorCanvasColor("black"), "#0a0a0a");
    assert.equal(normalizeComponentEditorCanvasColor("white"), "#ffffff");
    assert.equal(normalizeComponentEditorCanvasColor("#f90"), "#ff9900");
    assert.equal(normalizeComponentEditorCanvasColor("ff9600"), "#ff9600");
    assert.equal(normalizeComponentEditorCanvasColor("#ff960080"), "#ff9600");
    assert.equal(normalizeComponentEditorCanvasColor("not-a-color"), null);
  });

  it("parses legacy named canvas markers from older documents", () => {
    const legacy = composeComponentEditorDocument("<p>x</p>", "p{}", "vanilla", "white");
    // Rewrite marker to the old enum form to simulate older files.
    const withLegacyMarker = legacy.replace(
      "<!-- component-editor:canvas=#ffffff -->",
      "<!-- component-editor:canvas=white -->",
    );
    assert.equal(parseComponentEditorDocument(withLegacyMarker).canvas, "#ffffff");
  });
});
