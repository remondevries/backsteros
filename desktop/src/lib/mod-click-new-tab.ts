import { isInternalAppHref } from "../../packages/ui/src/navigation/is-internal-app-href.js";

export function isModClickOpenNewTab(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey" | "altKey" | "button">,
): boolean {
  if (event.button !== 0) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  // Alt+click is often "save link" in browsers; leave that to the host.
  if (event.altKey) return false;
  return true;
}

export function resolveModClickAnchorHref(
  target: EventTarget | null,
): string | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute("download")) return null;
  const rawHref = anchor.getAttribute("href") ?? "";
  if (!isInternalAppHref(rawHref)) return null;
  return rawHref;
}
