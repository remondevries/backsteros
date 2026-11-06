import type { Options } from "react-markdown";
import rehypeRaw from "rehype-raw";

type RehypePlugins = NonNullable<Options["rehypePlugins"]>;
type RemarkRehypeOptions = NonNullable<Options["remarkRehypeOptions"]>;

/**
 * Enable embedded HTML in staff-authored estimate markdown.
 * Raw only — no sanitize pass that would strip classes / reshape the tree.
 * Estimates are owner-written, not arbitrary user HTML.
 */
export const markdownHtmlRehypePlugins = [rehypeRaw] as RehypePlugins;

/** Keep remark→rehype from dropping HTML when raw parsing is enabled. */
export const markdownHtmlRemarkRehypeOptions = {
  allowDangerousHtml: true,
} satisfies RemarkRehypeOptions;
