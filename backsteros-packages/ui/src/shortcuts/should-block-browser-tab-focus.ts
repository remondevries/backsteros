/**
 * Whether Tab should be swallowed so the browser cannot move focus through
 * chrome/links. Intentional Tab flows (title → editor, compose fields, CM,
 * zone switching) run their own handlers; those targets are allowlisted here.
 */
export function shouldBlockBrowserTabFocus(event: KeyboardEvent): boolean {
  if (event.key !== "Tab") {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return true;
  }

  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return false;
  }

  if (target.isContentEditable) {
    return false;
  }

  if (
    target.closest(
      ".cm-editor, .cm-content, [data-document-editor-root='codemirror']",
    )
  ) {
    return false;
  }

  return true;
}
