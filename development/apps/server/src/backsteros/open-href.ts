/**
 * Write a desktop deep-link path for BacksterOS to pick up.
 * Matches the format Dynamic Island / other tools write to
 * `~/.config/backsteros/open-href` (stamp + path lines).
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const OPEN_HREF_HOME_REL = path.join(".config", "backsteros", "open-href");
const OPEN_HREF_TMP = "/tmp/backsteros-open-href";

export function normalizeDesktopOpenHref(raw: string): string | null {
  const href = raw.trim();
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

export function formatOpenHrefTrigger(href: string, stamp: number = Date.now()): string {
  return `${stamp}\n${href}\n`;
}

export function writeBacksterosDesktopOpenHref(rawHref: string): {
  ok: true;
  href: string;
  path: string;
} {
  const href = normalizeDesktopOpenHref(rawHref);
  if (!href) {
    throw new Error("href must be an absolute in-app path starting with /");
  }

  const homePath = path.join(os.homedir(), OPEN_HREF_HOME_REL);
  fs.mkdirSync(path.dirname(homePath), { recursive: true });
  const body = formatOpenHrefTrigger(href);
  fs.writeFileSync(homePath, body, "utf8");
  try {
    fs.writeFileSync(OPEN_HREF_TMP, body, "utf8");
  } catch {
    // /tmp mirror is best-effort (same as desktop watcher fallback).
  }
  return { ok: true, href, path: homePath };
}
