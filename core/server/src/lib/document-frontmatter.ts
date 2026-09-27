import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export type ParsedDocumentMarkdown = {
  frontMatter: Record<string, unknown>;
  body: string;
  valid: boolean;
  rawBlock: string | null;
};

export function splitDocumentMarkdown(content: string): ParsedDocumentMarkdown {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) {
    return {
      frontMatter: {},
      body: content,
      valid: true,
      rawBlock: null,
    };
  }

  const rawBlock = match[1] ?? "";
  let frontMatter: Record<string, unknown> = {};
  let valid = true;
  try {
    const parsed = parseYaml(rawBlock);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontMatter = parsed as Record<string, unknown>;
    } else if (parsed != null) {
      valid = false;
    }
  } catch {
    valid = false;
    frontMatter = {};
  }

  return {
    frontMatter,
    body: match[2] ?? "",
    valid,
    rawBlock,
  };
}

export function bodyForSnippet(content: string): string {
  const { body, valid, rawBlock } = splitDocumentMarkdown(content);
  if (!valid && rawBlock != null) {
    return content.replace(FRONTMATTER_PATTERN, "").trim();
  }
  return body.trim();
}

export function composeDocumentMarkdown(input: {
  frontMatter: Record<string, unknown>;
  body: string;
}): string {
  const body = input.body.replace(/^\n+/, "");
  const keys = Object.keys(input.frontMatter).filter(
    (key) => input.frontMatter[key] !== undefined && input.frontMatter[key] !== "",
  );
  if (keys.length === 0) {
    return body;
  }
  const sorted = keys.sort((a, b) => a.localeCompare(b));
  const record: Record<string, unknown> = {};
  for (const key of sorted) {
    record[key] = input.frontMatter[key];
  }
  const yaml = stringifyYaml(record, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body}`;
}

export function mergeFrontMatter(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}
