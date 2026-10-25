/**
 * Where to go after an email message, thread or draft leaves the list: a fixed
 * href, or a resolver that picks the neighbor of the removed row (by row,
 * message or draft id).
 */
export type EmailListReturnHref = string | ((removedId: string) => string);

export function resolveEmailListReturnHref(
  value: EmailListReturnHref,
  removedId: string | null | undefined,
): string {
  return typeof value === "function" ? value(removedId?.trim() || "") : value;
}
