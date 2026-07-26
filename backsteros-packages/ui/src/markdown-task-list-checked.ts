type HastElementLike = {
  type?: string;
  tagName?: string;
  children?: unknown[];
  properties?: Record<string, unknown> | null;
};

/**
 * remark-gfm puts `checked` on the child checkbox <input>, not the <li>.
 * Read it from the hast `node` (and fall back to a direct prop if present).
 */
export function getTaskListItemChecked(props: {
  checked?: boolean | null;
  node?: HastElementLike;
  className?: string;
}): boolean | null {
  if (typeof props.checked === "boolean") {
    return props.checked;
  }

  const children = props.node?.children;
  if (!Array.isArray(children)) {
    return null;
  }

  for (const child of children) {
    if (!child || typeof child !== "object") continue;
    const element = child as HastElementLike;
    if (element.type !== "element" || element.tagName !== "input") continue;

    const properties = element.properties ?? null;
    if (!properties) continue;

    const inputType = properties.type;
    if (inputType != null && inputType !== "checkbox") continue;

    // Hast boolean attrs are often `true` or `""` when present.
    if (!("checked" in properties)) {
      return false;
    }
    return properties.checked !== false && properties.checked != null;
  }

  return null;
}
