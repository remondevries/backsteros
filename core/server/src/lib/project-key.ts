/** Normalize a project key for display / persistence (2–3 alphanumeric). */
export function normalizeProjectKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
}

const PROJECT_KEY_SUFFIX_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Pick an unused 2–3 character project key near `preferred`.
 * Mirrors desktop `allocateUniqueProjectKey` (core must not depend on UI).
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

/** Prefer letters from the registrable label (e.g. example.com → EXA). */
export function preferredProjectKeyFromDomain(domainName: string): string {
  const label = domainName.split(".")[0] ?? domainName;
  const base = normalizeProjectKey(label);
  return base.length >= 2 ? base : "DOM";
}
