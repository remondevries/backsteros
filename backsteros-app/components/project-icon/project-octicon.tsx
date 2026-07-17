"use client";

import { createElement, useEffect, useState, type CSSProperties } from "react";

import { EntityIconDisplay } from "@/components/icons/entity-icon-display";
import { entityIconClassName, iconSvgColorStyle } from "@/lib/icon-color";
import { parseEntityIcon } from "@/lib/entity-icon";
import {
  DEFAULT_PROJECT_ICON,
  isProjectIconKey,
  loadProjectOcticonComponent,
  normalizeProjectIconKey,
} from "@/lib/project-icon";

import { DefaultProjectIcon } from "./default-project-icon";

type ProjectOcticonProps = {
  icon: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
};

type LoadedProjectOcticon = Awaited<
  ReturnType<typeof loadProjectOcticonComponent>
>;

function usesEntityIconDisplay(icon: string | null | undefined): boolean {
  if (!icon?.trim()) {
    return false;
  }

  const trimmed = icon.trim();
  if (trimmed.startsWith("{")) {
    return true;
  }

  const parsed = parseEntityIcon(trimmed);
  return parsed.kind === "emoji";
}

export function ProjectOcticon({
  icon,
  size = 16,
  className,
  title,
  style,
}: ProjectOcticonProps) {
  const iconKey = normalizeProjectIconKey(icon);
  const [loadedIcon, setLoadedIcon] = useState<{
    key: string;
    component: LoadedProjectOcticon;
  } | null>(null);

  useEffect(() => {
    if (
      usesEntityIconDisplay(icon) ||
      iconKey === DEFAULT_PROJECT_ICON ||
      !isProjectIconKey(iconKey)
    ) {
      return;
    }

    let cancelled = false;

    void loadProjectOcticonComponent(iconKey).then((component) => {
      if (!cancelled) {
        setLoadedIcon({ key: iconKey, component });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [icon, iconKey]);

  const IconComponent =
    loadedIcon?.key === iconKey ? loadedIcon.component : null;

  if (usesEntityIconDisplay(icon)) {
    return (
      <EntityIconDisplay
        icon={icon}
        size={size}
        className={className}
        title={title}
        fallback={(color) => (
          <DefaultProjectIcon
            size={size}
            className={
              color
                ? (entityIconClassName(className, color) ?? className)
                : className
            }
            style={{ ...iconSvgColorStyle(color), ...style }}
          />
        )}
      />
    );
  }

  if (iconKey === DEFAULT_PROJECT_ICON) {
    return (
      <DefaultProjectIcon
        size={size}
        className={className}
        style={style}
      />
    );
  }

  if (!IconComponent) {
    return (
      <DefaultProjectIcon
        size={size}
        className={className}
        style={style}
      />
    );
  }

  return createElement(IconComponent, {
    size,
    className,
    style,
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
  });
}

/** Normalize legacy/default sentinels; pass through entity icon payloads. */
export function getDisplayProjectIcon(
  icon: string | null | undefined,
): string | null {
  const trimmed = icon?.trim();
  if (!trimmed || trimmed === DEFAULT_PROJECT_ICON) {
    return null;
  }

  return trimmed;
}
