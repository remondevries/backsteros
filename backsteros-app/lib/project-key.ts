const KEY_SEGMENT_PATTERN = /[\s\-_]+/;

export function deriveProjectKeyFromName(name: string): string {
  const parts = name
    .trim()
    .split(KEY_SEGMENT_PATTERN)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 6);
  }

  const single = parts[0] ?? "PR";
  if (single.length >= 2) {
    return single.slice(0, 2).toUpperCase();
  }

  return single.toUpperCase().padEnd(2, "X");
}

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
