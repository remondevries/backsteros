import {
  classNameWithoutTextColor,
  iconSvgColorStyle,
  mergeIconSvgClassName,
  resolveEntityIconPaintColor,
} from "@backsteros/ui";

export {
  classNameWithoutTextColor,
  iconSvgColorStyle,
  mergeIconSvgClassName,
  resolveEntityIconPaintColor,
};

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
