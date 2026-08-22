"use client";

import {
  createElement,
  type ComponentType,
  type CSSProperties,
} from "react";

import { isProjectIconKey } from "../projects/project-icon-keys.js";
import { getOcticonComponent } from "../projects/project-octicon-registry.js";
import { DocumentIcon } from "./document-icon.js";
import {
  getDisplayProjectIcon,
  getEntityIconColor,
} from "./project-octicon.js";

export type DocumentOcticonProps = {
  icon: string | null | undefined;
  size?: number;
  className?: string;
  title?: string;
  style?: CSSProperties;
};

type OcticonComponent = ComponentType<{
  size?: number | "small" | "medium" | "large";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

function resolveOcticonComponent(key: string): OcticonComponent | null {
  if (!isProjectIconKey(key)) {
    return null;
  }
  return getOcticonComponent(key) as OcticonComponent | null;
}

/**
 * Document glyph — Primer octicon / emoji, else DocumentIcon.
 * Matches Next `DocumentOcticon` for desktop detail headers.
 */
export function DocumentOcticon({
  icon,
  size = 16,
  className,
  title,
  style,
}: DocumentOcticonProps) {
  const display = getDisplayProjectIcon(icon);
  const color = getEntityIconColor(icon);
  const colorStyle: CSSProperties | undefined = color
    ? { color, ...style }
    : style;

  if (!display) {
    return (
      <DocumentIcon size={size} className={className} style={colorStyle} />
    );
  }

  if (/[\u{1F300}-\u{1FAFF}]/u.test(display) || display.length <= 2) {
    return (
      <span
        className={className}
        style={{
          display: "inline-flex",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.85),
          lineHeight: 1,
          ...colorStyle,
        }}
        title={title}
        aria-hidden="true"
      >
        {display}
      </span>
    );
  }

  const component = resolveOcticonComponent(display);
  if (component) {
    return createElement(component, {
      size,
      className,
      style: colorStyle,
      "aria-hidden": true,
      ...(title ? { "aria-label": title } : {}),
    });
  }

  return <DocumentIcon size={size} className={className} style={colorStyle} />;
}
