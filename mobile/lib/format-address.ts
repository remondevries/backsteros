/** Multi-line postal address from common contact/org fields. */
export function formatAddress(parts: {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string | null {
  const line1 = parts.address?.trim() || "";
  const line2 = [parts.postalCode?.trim(), parts.city?.trim()]
    .filter(Boolean)
    .join(" ");
  const line3 = parts.country?.trim() || "";
  const combined = [line1, line2, line3].filter(Boolean).join("\n");
  return combined || null;
}
