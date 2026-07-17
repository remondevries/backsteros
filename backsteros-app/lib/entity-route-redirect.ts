import { encodeProjectSlug } from "@/lib/entity-slugs";

export function buildProjectKeyRenameRedirectPath(
  pathname: string,
  oldKey: string,
  newKey: string,
): string {
  const canonicalNewKey = encodeProjectSlug(newKey);
  const projectMatch = pathname.match(/^(\/projects)\/([^/]+)(.*)$/);

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
