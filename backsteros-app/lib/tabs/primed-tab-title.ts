/** Titles known before the detail screen mounts — avoids path-segment flash. */
const primedTitles = new Map<string, string>();

function normalizeHref(href: string): string {
  if (!href || href === "/") return "/";
  const [path] = href.split(/[?#]/);
  return path!.replace(/\/+$/, "") || "/";
}

export function primeTabTitle(href: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  primedTitles.set(normalizeHref(href), trimmed);
}

export function getPrimedTabTitle(href: string): string | null {
  return primedTitles.get(normalizeHref(href)) ?? null;
}
