import { migrateLegacyProjectType } from "./project-type";

export type DisplayEntityIcon = {
  /** Octicon key or emoji glyph — null means use the type default. */
  display: string | null;
  /** Paint color from a `{"t":"i"|"d","c":"#..."}` JSON payload, if present. */
  color?: string;
};

/** Strip Next entity-icon JSON / emoji payloads (parity with desktop `project-octicon`). */
export function parseDisplayEntityIcon(
  icon: string | null | undefined,
): DisplayEntityIcon {
  const trimmed = icon?.trim();
  if (!trimmed || trimmed === "default") {
    return { display: null };
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        t?: string;
        k?: string;
        v?: string;
        c?: string;
      };
      const color = typeof parsed.c === "string" ? parsed.c : undefined;

      if (parsed.t === "i" && parsed.k?.trim()) {
        return { display: parsed.k.trim(), color };
      }
      if (parsed.t === "e" && parsed.v?.trim()) {
        return { display: parsed.v.trim() };
      }
      if (parsed.t === "d") {
        return { display: null, color };
      }
    } catch {
      return { display: null };
    }
    return { display: null };
  }

  return { display: trimmed };
}

function defaultIconKeyForType(type: string | null | undefined): string | null {
  return migrateLegacyProjectType(type) === "codebase" ? "terminal" : null;
}

/** Resolve the glyph key/emoji shown for a project icon + type. */
export function getDisplayProjectIcon(
  icon: string | null | undefined,
  type?: string | null,
): string | null {
  return parseDisplayEntityIcon(icon).display ?? defaultIconKeyForType(type);
}

/** Extract the paint color from a serialized entity icon JSON payload, if any. */
export function getEntityIconColor(
  icon: string | null | undefined,
): string | undefined {
  return parseDisplayEntityIcon(icon).color;
}

/** Heuristic: emoji / short glyph vs octicon key name. */
export function isEmojiProjectIconDisplay(display: string): boolean {
  return /[\u{1F300}-\u{1FAFF}]/u.test(display) || display.length <= 2;
}
