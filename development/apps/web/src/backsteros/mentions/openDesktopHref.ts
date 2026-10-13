/** Ask the local T3 server to write a BacksterOS desktop open-href trigger. */

export async function openBacksterosDesktopHref(href: string): Promise<boolean> {
  const response = await fetch("/api/backsteros/open-desktop-href", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ href }),
  });
  if (!response.ok) return false;
  const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null;
  return payload?.ok === true;
}
