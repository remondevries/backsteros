/** Passthrough search validation so calendar query params survive TanStack navigation. */
export function validateCalendarSearch(
  search: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(search)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) out[key] = text;
  }
  return out;
}
