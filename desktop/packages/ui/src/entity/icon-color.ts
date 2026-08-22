import type { CSSProperties } from "react";

/** First icon-picker swatch — means “theme color”, not a fixed paint. */
export const DEFAULT_ENTITY_ICON_COLOR = "#9CA3AF";

/**
 * The first icon-picker swatch is a neutral gray meant to mean “use the theme
 * color”, not a fixed paint. Treat it like unset so icons inherit `currentColor`.
 */
export function resolveEntityIconPaintColor(
  color: string | null | undefined,
): string | undefined {
  if (!color) {
    return undefined;
  }

  if (color.toLowerCase() === DEFAULT_ENTITY_ICON_COLOR.toLowerCase()) {
    return undefined;
  }

  return color;
}

/**
 * Semantic SVG icons should paint with `fill="currentColor"` /
 * `stroke="currentColor"` so callers can override via `className` or style.
 */
export function iconSvgColorStyle(
  color: string | null | undefined,
): CSSProperties | undefined {
  const paint = resolveEntityIconPaintColor(color);
  if (!paint) {
    return undefined;
  }

  return { color: paint };
}

export function mergeIconSvgClassName(
  className: string | undefined,
  options?: {
    highlighted?: boolean;
    defaultClassName?: string;
  },
): string {
  const base = className ?? options?.defaultClassName ?? "shrink-0";

  if (options?.highlighted) {
    return base.includes("text-white") ? base : `${base} text-white`;
  }

  return base;
}

export function classNameWithoutTextColor(
  className?: string,
): string | undefined {
  if (!className) {
    return undefined;
  }

  const stripped = className
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("text-"))
    .join(" ");

  return stripped || undefined;
}
