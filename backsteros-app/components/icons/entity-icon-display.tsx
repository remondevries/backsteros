"use client";

import type { ReactNode } from "react";

import { ProjectOcticon } from "@/components/project-icon";
import {
  entityIconClassName,
  iconSvgColorStyle,
  resolveEntityIconPaintColor,
} from "@/lib/icon-color";
import { parseEntityIcon } from "@/lib/entity-icon";

const EMOJI_ICON_LAYOUT_CLASS =
  "inline-flex shrink-0 items-center justify-center leading-none select-none";

type EntityIconDisplayProps = {
  icon: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
  fallback: (color?: string) => ReactNode;
};

export function EntityIconDisplay({
  icon,
  size = 16,
  className,
  title,
  fallback,
}: EntityIconDisplayProps) {
  const parsed = parseEntityIcon(icon);

  if (parsed.kind === "emoji") {
    return (
      <span
        className={
          className
            ? `${EMOJI_ICON_LAYOUT_CLASS} ${className}`
            : EMOJI_ICON_LAYOUT_CLASS
        }
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.875),
          lineHeight: 1,
        }}
        title={title}
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        aria-label={title}
      >
        <span className="block leading-none" aria-hidden="true">
          {parsed.emoji}
        </span>
      </span>
    );
  }

  if (parsed.kind === "icon") {
    const paint = resolveEntityIconPaintColor(parsed.color);
    return (
      <ProjectOcticon
        icon={parsed.key}
        size={size}
        className={entityIconClassName(className, paint)}
        title={title}
        style={iconSvgColorStyle(paint)}
      />
    );
  }

  return <>{fallback(resolveEntityIconPaintColor(parsed.color))}</>;
}
