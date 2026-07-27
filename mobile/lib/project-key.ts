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
