/**
 * Detect CommonMark / GFM block constructs that must not render inside <p>.
 * Used by document preview so lists/headings are siblings, not nested.
 */
export function hasBlockMarkdown(content: string): boolean {
  return /^(?:[ \t]*#{1,6}[ \t]|[ \t]*[-*+][ \t]|[ \t]*\d+[.)][ \t]|[ \t]*```|[ \t]*>[ \t]|[ \t]*\|.+\||[ \t]*<(?:ol|ul|pre|table|blockquote)\b)/im.test(
    content,
  );
}
