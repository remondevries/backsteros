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
