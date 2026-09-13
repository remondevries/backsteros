/**
 * Spaces publish front matter — kept in sync with desktop document-frontmatter.
 */

export type SpacesPublishFrontmatter = {
  title?: string;
  status?: "concept" | "published" | "offline";
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  audience?: "group" | "individual";
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function unquote(raw: string): string {
  return raw.trim().replace(/^['"]|['"]$/g, "");
}

function parseFrontmatterBlock(block: string): SpacesPublishFrontmatter {
  const result: SpacesPublishFrontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = unquote(match[2] ?? "");
    switch (key) {
      case "title":
        result.title = value;
        break;
      case "status":
        if (value === "concept" || value === "published" || value === "offline") {
          result.status = value;
        }
        break;
      case "slug":
        result.slug = value;
        break;
      case "seoTitle":
        result.seoTitle = value;
        break;
      case "seoDescription":
        result.seoDescription = value;
        break;
      case "audience":
        if (value === "group" || value === "individual") {
          result.audience = value;
        }
        break;
      default:
        break;
    }
  }
  return result;
}

export function parseSpacesMarkdown(content: string): {
  frontmatter: SpacesPublishFrontmatter;
  body: string;
} {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  return {
    frontmatter: parseFrontmatterBlock(match[1] ?? ""),
    body: match[2] ?? "",
  };
}

function yamlEscape(value: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

export function serializeSpacesMarkdown(input: {
  frontmatter?: SpacesPublishFrontmatter;
  body: string;
}): string {
  const body = input.body.replace(/^\n+/, "");
  const fm = input.frontmatter ?? {};
  const lines: string[] = [];
  if (fm.title?.trim()) lines.push(`title: ${yamlEscape(fm.title.trim())}`);
  if (fm.status) lines.push(`status: ${fm.status}`);
  if (fm.slug?.trim()) lines.push(`slug: ${yamlEscape(fm.slug.trim())}`);
  if (fm.seoTitle?.trim()) {
    lines.push(`seoTitle: ${yamlEscape(fm.seoTitle.trim())}`);
  }
  if (fm.seoDescription?.trim()) {
    lines.push(`seoDescription: ${yamlEscape(fm.seoDescription.trim())}`);
  }
  if (fm.audience) lines.push(`audience: ${fm.audience}`);
  if (lines.length === 0) return body;
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}
