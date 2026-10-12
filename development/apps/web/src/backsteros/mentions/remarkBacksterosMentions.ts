/**
 * Remark plugin: turn `[@task:…]` tokens into links with a custom scheme so
 * ChatMarkdown can render polished mention chips in agent chat.
 */

import {
  findAndReplaceText,
  type MarkdownNode,
  type TextMatch,
} from "~/vendor/mdast-find-and-replace";

import { MENTION_TOKEN_RE, parseMentionToken } from "./mention-tokens";

export const BACKSTEROS_MENTION_SCHEME = "backsteros-mention:";

export function backsterosMentionHref(raw: string): string {
  return `${BACKSTEROS_MENTION_SCHEME}${encodeURIComponent(raw)}`;
}

export function parseBacksterosMentionHref(href: string | null | undefined): string | null {
  if (!href?.startsWith(BACKSTEROS_MENTION_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(BACKSTEROS_MENTION_SCHEME.length));
  } catch {
    return null;
  }
}

export function remarkBacksterosMentions() {
  return (tree: MarkdownNode) => {
    findAndReplaceText(
      tree,
      MENTION_TOKEN_RE,
      (matched: string, _match: TextMatch) => {
        const parsed = parseMentionToken(matched);
        if (!parsed) return false;
        return {
          type: "link",
          url: backsterosMentionHref(matched),
          data: {
            hProperties: {
              dataBacksterosMention: "true",
            },
          },
          children: [{ type: "text", value: matched }],
        };
      },
      new Set(["link", "linkReference", "code", "inlineCode"]),
    );
  };
}
