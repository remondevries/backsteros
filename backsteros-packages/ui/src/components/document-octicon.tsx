"use client";

import {
  createElement,
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import * as PrimerOcticons from "@primer/octicons-react";

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

function kebabToPascalIconName(key: string): string {
  return (
    key
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") + "Icon"
  );
}

function resolveOcticonComponent(key: string): OcticonComponent | null {
  const exportName = kebabToPascalIconName(key);
  const candidate = (PrimerOcticons as Record<string, unknown>)[exportName];
  return typeof candidate === "function"
    ? (candidate as OcticonComponent)
    : null;
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
  const [component, setComponent] = useState<OcticonComponent | null>(null);
  const colorStyle: CSSProperties | undefined = color
    ? { color, ...style }
    : style;

  useEffect(() => {
    if (!display || display.length <= 2) {
      setComponent(null);
      return;
    }
    if (/[\u{1F300}-\u{1FAFF}]/u.test(display) || display.length <= 2) {
      setComponent(null);
      return;
    }
    setComponent(resolveOcticonComponent(display));
  }, [display]);

  if (!display) {
    return <DocumentIcon size={size} className={className} style={colorStyle} />;
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
