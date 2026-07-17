import type { CSSProperties } from "react";

import { DEFAULT_ENTITY_ICON_COLOR } from "@/lib/entity-icon";

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
 * Semantic SVG icons should paint with `fill="currentColor"` / `stroke="currentColor"`
 * so callers can override via `className` (Tailwind `text-*`) or this style helper.
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

/** Drop Tailwind text-* classes so an inline icon color can apply via currentColor. */
export function entityIconClassName(
  className: string | undefined,
  color: string | null | undefined,
  fallbackClassName = "shrink-0",
): string | undefined {
  if (resolveEntityIconPaintColor(color)) {
    return classNameWithoutTextColor(className) ?? fallbackClassName;
  }

  return className;
}

export function classNameWithoutTextColor(className?: string): string | undefined {
  if (!className) {
    return undefined;
  }

  const stripped = className
    .split(/\s+/)
    .filter((token) => token && !token.startsWith("text-"))
    .join(" ");

  return stripped || undefined;
}
