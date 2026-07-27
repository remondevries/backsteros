/**
 * Prefix an app-absolute path with NEXT_PUBLIC_BASE_PATH (e.g. `/app`).
 * Browser `fetch("/api/…")` does not get Next.js basePath automatically.
 */
export function withBasePath(path: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    return normalized;
  }
  if (normalized === base || normalized.startsWith(`${base}/`)) {
    return normalized;
  }
  return `${base}${normalized}`;
}
