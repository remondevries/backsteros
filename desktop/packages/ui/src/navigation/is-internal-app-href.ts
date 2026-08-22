/**
 * True for same-app paths (`/tasks/…`) that should use client-side navigation.
 * External URLs, mailto, and hash-only links stay as normal anchors.
 */
export function isInternalAppHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return false;
  }
  if (
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  ) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//");
  }
  try {
    const url = new URL(trimmed, "http://internal.invalid");
    return (
      url.origin === "http://internal.invalid" &&
      url.pathname.startsWith("/")
    );
  } catch {
    return false;
  }
}
