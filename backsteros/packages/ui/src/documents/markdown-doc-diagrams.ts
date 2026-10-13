/**
 * Normalize AF-style `<figure class="doc-diagram">` HTML (with
 * `<pre class="mermaid">`) into fenced ```mermaid blocks so react-markdown
 * can render them without rehype-raw.
 */
export function normalizeDocDiagramMarkdown(markdown: string): string {
  if (!markdown.includes("doc-diagram") && !markdown.includes("```mermaid")) {
    return markdown;
  }

  return markdown.replace(
    /<figure\b[^>]*\bclass=(["'])(?:[^"']*\s)?doc-diagram(?:\s[^"']*)?\1[^>]*>([\s\S]*?)<\/figure>/gi,
    (_full, _quote: string, inner: string) => {
      const captionMatch = inner.match(
        /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i,
      );
      const mermaidMatch = inner.match(
        /<pre\b[^>]*\bclass=(["'])(?:[^"']*\s)?mermaid(?:\s[^"']*)?\1[^>]*>([\s\S]*?)<\/pre>/i,
      );
      if (!mermaidMatch?.[2]) {
        return _full;
      }

      const caption = stripTags(captionMatch?.[1] ?? "").trim();
      const source = decodeBasicHtmlEntities(mermaidMatch[2]).trim();
      if (!source) return _full;

      const captionLine = caption
        ? `*${caption.replace(/\*/g, "\\*")}*\n\n`
        : "";
      return `${captionLine}\`\`\`mermaid\n${source}\n\`\`\``;
    },
  );
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractMermaidSourceFromCodeChildren(
  children: unknown,
): string | null {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children
      .map((child) => extractMermaidSourceFromCodeChildren(child) ?? "")
      .join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: unknown } }).props;
    return extractMermaidSourceFromCodeChildren(props?.children);
  }
  return null;
}

export function isMermaidCodeClassName(
  className: string | undefined | null,
): boolean {
  if (!className) return false;
  return (
    className.includes("language-mermaid") ||
    /(^|\s)mermaid(\s|$)/.test(className)
  );
}
