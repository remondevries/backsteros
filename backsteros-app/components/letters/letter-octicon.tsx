"use client";

import { EntityIconDisplay } from "@/components/icons/entity-icon-display";
import {
  entityIconClassName,
  iconSvgColorStyle,
  resolveEntityIconPaintColor,
} from "@/lib/icon-color";

import { LetterIcon } from "./letter-icon";

type LetterOcticonProps = {
  icon: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
};

export function LetterOcticon({
  icon,
  size = 16,
  className,
  title,
}: LetterOcticonProps) {
  return (
    <EntityIconDisplay
      icon={icon}
      size={size}
      className={className}
      title={title}
      fallback={(color) => {
        const paint = resolveEntityIconPaintColor(color);
        return (
          <LetterIcon
            size={size}
            className={
              paint
                ? (entityIconClassName(className, paint, "size-4 shrink-0") ??
                  "size-4 shrink-0")
                : (className ?? "size-4 shrink-0")
            }
            style={iconSvgColorStyle(paint)}
          />
        );
      }}
    />
  );
}
