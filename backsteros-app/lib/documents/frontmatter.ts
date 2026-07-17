export type DocumentFrontmatter = {
  title?: string;
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFrontmatterBlock(block: string): DocumentFrontmatter {
  const result: DocumentFrontmatter = {};

  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^title:\s*(.+)$/);
    if (match) {
      const raw = match[1].trim();
      result.title = raw.replace(/^['"]|['"]$/g, "");
    }
  }

  return result;
}

export function parseMarkdownDocument(content: string): {
  frontmatter: DocumentFrontmatter;
  body: string;
} {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  return {
    frontmatter: parseFrontmatterBlock(match[1]),
    body: match[2],
  };
}

export function serializeMarkdownDocument(input: {
  frontmatter?: DocumentFrontmatter;
  body: string;
}): string {
  const title = input.frontmatter?.title?.trim();
  const body = input.body.replace(/^\n+/, "");

  if (!title) {
    return body;
  }

  return `---\ntitle: ${title}\n---\n\n${body}`;
}
