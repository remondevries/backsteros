import { INBOX_TASK_KEY } from "./task-display-id.js";

/** Normalize a project key for display / persistence (2–3 alphanumeric). */
export function normalizeProjectKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
}

export function isValidProjectKey(value: string): boolean {
  return /^[A-Z0-9]{2,3}$/.test(value);
}

const PROJECT_KEY_SUFFIX_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Pick an unused 2–3 character project key near `preferred`.
 * Used when duplicating a project whose key is already taken.
 */
export function allocateUniqueProjectKey(
  preferred: string,
  existingKeys: Iterable<string>,
): string {
  const taken = new Set(
    [...existingKeys].map((key) => normalizeProjectKey(key)).filter(Boolean),
  );
  const base = normalizeProjectKey(preferred) || "PRJ";

  if (!taken.has(base)) {
    return base;
  }

  const prefix2 = base.slice(0, 2);
  for (const char of PROJECT_KEY_SUFFIX_CHARS) {
    const candidate = normalizeProjectKey(`${prefix2}${char}`);
    if (candidate.length >= 2 && !taken.has(candidate)) {
      return candidate;
    }
  }

  for (const a of PROJECT_KEY_SUFFIX_CHARS) {
    for (const b of PROJECT_KEY_SUFFIX_CHARS) {
      const two = normalizeProjectKey(`${a}${b}`);
      if (!taken.has(two)) {
        return two;
      }
      for (const c of PROJECT_KEY_SUFFIX_CHARS) {
        const three = normalizeProjectKey(`${a}${b}${c}`);
        if (!taken.has(three)) {
          return three;
        }
      }
    }
  }

  throw new Error("Could not allocate a unique project key.");
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

  return rewriteTaskSlugPrefixes(next, oldKey, canonicalNewKey);
}

export type TaskProjectChangeRedirectInput = {
  taskId: string;
  taskNumber: number;
  oldProjectKey?: string | null;
  newProjectKey: string | null;
  /**
   * When provided, org-scoped task URLs retarget to this org param.
   * `null` forces a standalone `/projects/…` href.
   * `undefined` preserves the current org segment (rename-style rewrite).
   */
  newOrganizationRouteParam?: string | null;
  /**
   * Use the durable task id as the route leaf instead of `key-number`.
   * Prefer this until the destination scope has assigned a number (moves can
   * renumber when the old number is already taken in the target project).
   */
  routeLeaf?: "display-slug" | "task-id";
};

/**
 * After a task moves to another project (or leaves its project), rewrite
 * project-scoped URLs / breadcrumb trails so the old project segment is replaced.
 */
export function buildTaskProjectChangeRedirectPath(
  pathname: string,
  input: TaskProjectChangeRedirectInput,
): string {
  const pathOnly = pathname.split("?")[0] ?? pathname;
  const oldKey = input.oldProjectKey?.trim() || null;
  const newKey = input.newProjectKey?.trim() || null;

  if (!newKey) {
    if (isProjectScopedTaskPath(pathOnly) || hasProjectTrailSource(pathOnly)) {
      return `/tasks/${encodeURIComponent(input.taskId)}`;
    }
    if (oldKey) {
      return (
        rewriteDueFilterTaskSlug(
          pathOnly,
          oldKey,
          encodeProjectSlug(INBOX_TASK_KEY),
        ) ?? pathOnly
      );
    }
    return pathOnly;
  }

  const canonicalNewKey = encodeProjectSlug(newKey);
  const projectTaskMatch = pathOnly.match(
    /^(\/organizations\/([^/]+))?\/projects\/([^/]+)\/tasks\/([^/]+)\/?$/,
  );
  if (projectTaskMatch) {
    const currentOrg = projectTaskMatch[2]
      ? decodeURIComponent(projectTaskMatch[2])
      : null;
    const nextOrg =
      input.newOrganizationRouteParam === undefined
        ? currentOrg
        : input.newOrganizationRouteParam;
    const taskSlug =
      input.routeLeaf === "task-id"
        ? encodeURIComponent(input.taskId)
        : `${canonicalNewKey}-${input.taskNumber}`;
    if (nextOrg) {
      return `/organizations/${encodeURIComponent(nextOrg)}/projects/${canonicalNewKey}/tasks/${taskSlug}`;
    }
    return `/projects/${canonicalNewKey}/tasks/${taskSlug}`;
  }

  if (oldKey) {
    const renamed = buildProjectKeyRenameRedirectPath(pathOnly, oldKey, newKey);
    const withTrailSlug = rewriteTrailTaskSlugPrefixes(
      renamed,
      oldKey,
      canonicalNewKey,
    );
    if (withTrailSlug !== pathOnly) {
      return withTrailSlug;
    }

    const dueFilterPath = rewriteDueFilterTaskSlug(
      pathOnly,
      oldKey,
      canonicalNewKey,
    );
    if (dueFilterPath) {
      return dueFilterPath;
    }
  }

  return pathOnly;
}

function isProjectScopedTaskPath(pathname: string): boolean {
  return /^(?:\/organizations\/[^/]+)?\/projects\/[^/]+\/tasks\/[^/]+\/?$/.test(
    pathname,
  );
}

function hasProjectTrailSource(pathname: string): boolean {
  return /^(?:\/organizations\/[^/]+)?\/projects\/[^/]+\/~/.test(pathname);
}

function rewriteTaskSlugPrefixes(
  pathname: string,
  oldKey: string,
  canonicalNewKey: string,
): string {
  const oldTaskSlugPrefix = `${encodeProjectSlug(oldKey)}-`;
  const newTaskSlugPrefix = `${canonicalNewKey}-`;
  if (oldTaskSlugPrefix === newTaskSlugPrefix) {
    return pathname;
  }

  return pathname.replace(
    new RegExp(`(/tasks/)${escapeRegExp(oldTaskSlugPrefix)}(\\d+)`, "gi"),
    `$1${newTaskSlugPrefix}$2`,
  );
}

function rewriteTrailTaskSlugPrefixes(
  pathname: string,
  oldKey: string,
  canonicalNewKey: string,
): string {
  const oldTaskSlugPrefix = `${encodeProjectSlug(oldKey)}-`;
  const newTaskSlugPrefix = `${canonicalNewKey}-`;
  if (oldTaskSlugPrefix === newTaskSlugPrefix) {
    return pathname;
  }

  return pathname.replace(
    new RegExp(`(/~task/)${escapeRegExp(oldTaskSlugPrefix)}(\\d+)`, "gi"),
    `$1${newTaskSlugPrefix}$2`,
  );
}

function rewriteDueFilterTaskSlug(
  pathname: string,
  oldKey: string,
  canonicalNewKey: string,
): string | null {
  const match = pathname.match(/^\/tasks\/([^/]+)\/([^/]+)\/?$/);
  if (!match) return null;

  const dueFilter = match[1]!;
  // Keep UUID / non-slug task ids untouched.
  if (dueFilter === "inbox") return null;

  let slug: string;
  try {
    slug = decodeURIComponent(match[2]!);
  } catch {
    return null;
  }

  const oldPrefix = `${encodeProjectSlug(oldKey)}-`;
  if (!slug.toLowerCase().startsWith(oldPrefix)) {
    return null;
  }
  const numberPart = slug.slice(oldPrefix.length);
  if (!/^\d+$/.test(numberPart)) {
    return null;
  }

  return `/tasks/${dueFilter}/${canonicalNewKey}-${numberPart}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
