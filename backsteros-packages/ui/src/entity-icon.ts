import { ENTITY_ICON_EMOJIS } from "./entity-icon-emojis.js";
import { DEFAULT_ENTITY_ICON_COLOR } from "./icon-color.js";
import { isProjectIconKey, type ProjectIconKey } from "./project-icon-keys.js";

export { DEFAULT_ENTITY_ICON_COLOR };

/** Preset icon colors (matches the icon picker swatches). */
export const ENTITY_ICON_COLOR_PRESETS = [
  "#9CA3AF",
  "#64748B",
  "#38BDF8",
  "#4ADE80",
  "#FACC15",
  "#FB923C",
  "#FDBA74",
  "#F87171",
] as const;

export type ParsedEntityIcon =
  | { kind: "default"; color?: string }
  | { kind: "icon"; key: ProjectIconKey; color?: string }
  | { kind: "emoji"; emoji: string };

const ALLOWED_EMOJI = new Set(ENTITY_ICON_EMOJIS.map((entry) => entry.emoji));

export function isValidEntityIconColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

export function isAllowedEntityIconEmoji(value: string): boolean {
  return ALLOWED_EMOJI.has(value);
}

export function parseEntityIcon(
  raw: string | null | undefined,
): ParsedEntityIcon {
  if (!raw?.trim()) {
    return { kind: "default" };
  }

  const trimmed = raw.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        if (record.t === "d") {
          const color =
            typeof record.c === "string" && isValidEntityIconColor(record.c)
              ? record.c
              : undefined;

          return { kind: "default", color };
        }

        if (record.t === "e" && typeof record.v === "string") {
          if (isAllowedEntityIconEmoji(record.v)) {
            return { kind: "emoji", emoji: record.v };
          }
          return { kind: "default" };
        }

        if (record.t === "i" && typeof record.k === "string") {
          if (!isProjectIconKey(record.k)) {
            return { kind: "default" };
          }

          const color =
            typeof record.c === "string" && isValidEntityIconColor(record.c)
              ? record.c
              : undefined;

          return { kind: "icon", key: record.k, color };
        }
      }
    } catch {
      return { kind: "default" };
    }
  }

  if (isProjectIconKey(trimmed)) {
    return { kind: "icon", key: trimmed };
  }

  return { kind: "default" };
}

export function serializeEntityIcon(value: ParsedEntityIcon): string | null {
  if (value.kind === "default") {
    if (value.color && isValidEntityIconColor(value.color)) {
      return JSON.stringify({ t: "d", c: value.color });
    }

    return null;
  }

  if (value.kind === "emoji") {
    return JSON.stringify({ t: "e", v: value.emoji });
  }

  if (value.color && isValidEntityIconColor(value.color)) {
    return JSON.stringify({ t: "i", k: value.key, c: value.color });
  }

  return value.key;
}

export function isValidEntityIcon(raw: string | null): boolean {
  if (raw === null) {
    return true;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }

  const serialized = serializeEntityIcon(parseEntityIcon(trimmed));
  return serialized === trimmed;
}

/** Extract the paint color from a serialized entity icon, if any. */
export function getEntityIconColor(
  raw: string | null | undefined,
): string | undefined {
  const parsed = parseEntityIcon(raw);
  return parsed.kind === "emoji" ? undefined : parsed.color;
}

export function entityIconsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (
    serializeEntityIcon(parseEntityIcon(a)) ===
    serializeEntityIcon(parseEntityIcon(b))
  );
}

/** Structured icon payload for HTTP API consumers. */
export type EntityIconApiDetail =
  | { kind: "default"; color: string | null }
  | { kind: "icon"; key: ProjectIconKey; color: string | null }
  | { kind: "emoji"; emoji: string };

export function serializeEntityIconForApi(
  raw: string | null | undefined,
): EntityIconApiDetail {
  const parsed = parseEntityIcon(raw);

  if (parsed.kind === "emoji") {
    return { kind: "emoji", emoji: parsed.emoji };
  }

  if (parsed.kind === "icon") {
    return {
      kind: "icon",
      key: parsed.key,
      color: parsed.color ?? null,
    };
  }

  return { kind: "default", color: parsed.color ?? null };
}
