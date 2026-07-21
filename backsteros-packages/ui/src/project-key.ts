/** Normalize a project key for display / persistence (2–6 alphanumeric). */
export function normalizeProjectKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function isValidProjectKey(value: string): boolean {
  return /^[A-Z0-9]{2,6}$/.test(value);
}

/** Lowercase slug used in `/projects/{slug}` paths. */
export function encodeProjectSlug(key: string): string {
  return normalizeProjectKey(key).toLowerCase();
}

/**
 * Replace the project key segment (and matching task slug prefixes) after a rename.
 * Handles standalone `/projects/…` and org-scoped `/organizations/…/projects/…`.
 */
export function buildProjectKeyRenameRedirectPath(
  pathname: string,
  oldKey: string,
  newKey: string,
): string {
  const canonicalNewKey = encodeProjectSlug(newKey);
  const projectMatch = pathname.match(
    /^((?:\/organizations\/[^/]+)?\/projects)\/([^/]+)(.*)$/,
  );

  if (!projectMatch) {
    return pathname;
  }

  const [, prefix, , rest = ""] = projectMatch;
  const next = `${prefix}/${canonicalNewKey}${rest}`;

  const oldTaskSlugPrefix = `${encodeProjectSlug(oldKey)}-`;
  const newTaskSlugPrefix = `${canonicalNewKey}-`;
  if (oldTaskSlugPrefix === newTaskSlugPrefix) {
    return next;
  }

  return next.replace(
    new RegExp(`(/tasks/)${escapeRegExp(oldTaskSlugPrefix)}(\\d+)`, "gi"),
    `$1${newTaskSlugPrefix}$2`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
