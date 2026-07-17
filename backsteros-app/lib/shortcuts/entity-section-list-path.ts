/** Routes whose main content includes a navigable list; j/k defaults to that list until Tab switches zone. */
export function isEntitySectionListPathname(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  return (
    /^\/organizations\/[^/]+\/(projects|letters|contacts)$/.test(path) ||
    /^\/organizations\/[^/]+\/contacts\/[^/]+\/(tasks|letters)$/.test(path) ||
    /^\/contacts\/[^/]+\/(tasks|letters)$/.test(path)
  );
}
