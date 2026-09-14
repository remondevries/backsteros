/** Workspace-relative path agents can read/write for the Component editor. */
export const COMPONENT_EDITOR_RELATIVE_PATH = ".backsterdev/component-editor.html";

export type ComponentEditorFramework = "vanilla" | "tailwind";
export type ComponentEditorAppearance = "light" | "dark";

/** Preview canvas background as a normalized `#rrggbb` color. */
export type ComponentEditorCanvasColor = string;

export const COMPONENT_EDITOR_FRAMEWORKS = [
  { id: "vanilla", label: "Vanilla CSS" },
  { id: "tailwind", label: "Tailwind CSS" },
] as const satisfies ReadonlyArray<{
  id: ComponentEditorFramework;
  label: string;
}>;

export const COMPONENT_EDITOR_DEFAULT_CANVAS = "#0a0a0a";
export const COMPONENT_EDITOR_DEFAULT_APPEARANCE: ComponentEditorAppearance = "dark";

const LEGACY_CANVAS_COLORS: Record<string, string> = {
  black: "#0a0a0a",
  white: "#ffffff",
  gray: "#e5e5e5",
};

export const COMPONENT_EDITOR_DEFAULT_HTML = `<div class="card">
  <h1>Hello</h1>
  <p>Edit the HTML and CSS tabs above. The live preview updates as you type.</p>
</div>
`;

export const COMPONENT_EDITOR_DEFAULT_CSS = `html, body {
  margin: 0;
  min-height: 100%;
  background: #0a0a0a;
  color: #f5f5f5;
  font-family: ui-sans-serif, system-ui, sans-serif;
}

.card {
  max-width: 32rem;
  width: min(100% - 2rem, 32rem);
  padding: 1.5rem;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 12px;
  background: rgb(255 255 255 / 0.04);
}

.card h1 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}

.card p {
  margin: 0;
  line-height: 1.5;
  color: rgb(255 255 255 / 0.7);
}
`;

const BODY_START = "<!-- component-editor:body -->";
const BODY_END = "<!-- /component-editor:body -->";
const STYLE_OPEN = '<style id="component-editor-css">';
const STYLE_CLOSE = "</style>";
const FRAMEWORK_MARKER_RE = /<!--\s*component-editor:framework=(vanilla|tailwind)\s*-->/;
const CANVAS_MARKER_RE = /<!--\s*component-editor:canvas=(#[\da-fA-F]{3,8}|black|white|gray)\s*-->/;
const APPEARANCE_MARKER_RE = /<!--\s*component-editor:appearance=(light|dark)\s*-->/;

/** Tailwind Play CDN — browser build for quick prototyping in the preview. */
const TAILWIND_BROWSER_SCRIPT =
  '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>';

/** Class-based dark: utilities so the preview switch controls `dark:` variants. */
const TAILWIND_DARK_VARIANT = `<style type="text/tailwindcss">
@custom-variant dark (&:where(.dark, .dark *));
</style>`;

/**
 * Make `@media (prefers-color-scheme: …)` follow the preview appearance switch
 * instead of the host OS preference.
 */
function prefersColorSchemeShim(appearance: ComponentEditorAppearance): string {
  const dark = appearance === "dark" ? "true" : "false";
  return `<script>(function(){var dark=${dark};var native=window.matchMedia.bind(window);window.matchMedia=function(query){if(typeof query==="string"&&query.indexOf("prefers-color-scheme")!==-1){var matches=/prefers-color-scheme:\\s*dark/.test(query)?dark:/prefers-color-scheme:\\s*light/.test(query)?!dark:native(query).matches;return{matches:matches,media:query,onchange:null,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){},dispatchEvent:function(){return false;}};}return native(query);};})();<\/script>`;
}

export function isComponentEditorFramework(value: string): value is ComponentEditorFramework {
  return value === "vanilla" || value === "tailwind";
}

export function isComponentEditorAppearance(value: string): value is ComponentEditorAppearance {
  return value === "light" || value === "dark";
}

/** Normalize user/legacy canvas colors to `#rrggbb`, or `null` if invalid. */
export function normalizeComponentEditorCanvasColor(
  value: string,
): ComponentEditorCanvasColor | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (LEGACY_CANVAS_COLORS[trimmed]) return LEGACY_CANVAS_COLORS[trimmed];

  let hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (/^#[\da-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[\da-f]{8}$/.test(hex)) {
    hex = `#${hex.slice(1, 7)}`;
  }
  if (/^#[\da-f]{6}$/.test(hex)) return hex;
  return null;
}

export function componentEditorCanvasColor(
  canvas: string | null | undefined,
): ComponentEditorCanvasColor {
  return normalizeComponentEditorCanvasColor(canvas ?? "") ?? COMPONENT_EDITOR_DEFAULT_CANVAS;
}

function frameworkHeadSnippet(framework: ComponentEditorFramework): string {
  if (framework === "tailwind") {
    return `${TAILWIND_BROWSER_SCRIPT}\n${TAILWIND_DARK_VARIANT}\n`;
  }
  return "";
}

/** Early paint color so srcdoc reloads do not flash the browser default white. */
function canvasHeadSnippet(canvasColor: ComponentEditorCanvasColor): string {
  return `<style id="component-editor-canvas">html,body{height:100%;min-height:100%;margin:0;background-color:${canvasColor}}#component-editor-stage{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;width:100%}</style>\n`;
}

/** Build the self-contained HTML file (preview + agent-readable artifact). */
export function composeComponentEditorDocument(
  html: string,
  css: string,
  framework: ComponentEditorFramework = "vanilla",
  canvas: string = COMPONENT_EDITOR_DEFAULT_CANVAS,
  appearance: ComponentEditorAppearance = COMPONENT_EDITOR_DEFAULT_APPEARANCE,
): string {
  const canvasColor = componentEditorCanvasColor(canvas);
  const rootClass = appearance === "dark" ? "dark" : "light";
  return `<!DOCTYPE html>
<html lang="en" class="${rootClass}" style="color-scheme:${appearance};background-color:${canvasColor}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="${appearance}" />
<title>Component editor</title>
<!-- component-editor:framework=${framework} -->
<!-- component-editor:canvas=${canvasColor} -->
<!-- component-editor:appearance=${appearance} -->
${prefersColorSchemeShim(appearance)}
${canvasHeadSnippet(canvasColor)}${frameworkHeadSnippet(framework)}${STYLE_OPEN}
${css.trimEnd()}
${STYLE_CLOSE}
</head>
<body style="color-scheme:${appearance};background-color:${canvasColor}">
<div id="component-editor-stage">
${BODY_START}
${html.trimEnd()}
${BODY_END}
</div>
</body>
</html>
`;
}

/** Split a saved document back into body HTML + CSS + framework + canvas + appearance. */
export function parseComponentEditorDocument(source: string): {
  html: string;
  css: string;
  framework: ComponentEditorFramework;
  canvas: ComponentEditorCanvasColor;
  appearance: ComponentEditorAppearance;
} {
  const styleStart = source.indexOf(STYLE_OPEN);
  const styleEnd = source.indexOf(STYLE_CLOSE, styleStart + STYLE_OPEN.length);
  const bodyStart = source.indexOf(BODY_START);
  const bodyEnd = source.indexOf(BODY_END, bodyStart + BODY_START.length);
  const frameworkMatch = source.match(FRAMEWORK_MARKER_RE);
  const canvasMatch = source.match(CANVAS_MARKER_RE);
  const appearanceMatch = source.match(APPEARANCE_MARKER_RE);
  const framework: ComponentEditorFramework =
    frameworkMatch && isComponentEditorFramework(frameworkMatch[1]) ? frameworkMatch[1] : "vanilla";
  const canvas = componentEditorCanvasColor(canvasMatch?.[1] ?? COMPONENT_EDITOR_DEFAULT_CANVAS);
  const appearance: ComponentEditorAppearance =
    appearanceMatch && isComponentEditorAppearance(appearanceMatch[1])
      ? appearanceMatch[1]
      : COMPONENT_EDITOR_DEFAULT_APPEARANCE;

  const css =
    styleStart >= 0 && styleEnd > styleStart
      ? source
          .slice(styleStart + STYLE_OPEN.length, styleEnd)
          .replace(/^\n/, "")
          .replace(/\n$/, "")
      : COMPONENT_EDITOR_DEFAULT_CSS.trimEnd();

  const html =
    bodyStart >= 0 && bodyEnd > bodyStart
      ? source
          .slice(bodyStart + BODY_START.length, bodyEnd)
          .replace(/^\n/, "")
          .replace(/\n$/, "")
      : COMPONENT_EDITOR_DEFAULT_HTML.trimEnd();

  return { html, css, framework, canvas, appearance };
}

/** srcdoc document for the sandboxed live preview. */
export function componentEditorPreviewSrcDoc(
  html: string,
  css: string,
  framework: ComponentEditorFramework = "vanilla",
  canvas: string = COMPONENT_EDITOR_DEFAULT_CANVAS,
  appearance: ComponentEditorAppearance = COMPONENT_EDITOR_DEFAULT_APPEARANCE,
): string {
  return composeComponentEditorDocument(html, css, framework, canvas, appearance);
}
