"use client";

import {
  createElement,
  type ComponentType,
  type CSSProperties,
} from "react";

import { isProjectIconKey } from "../project-icon-keys.js";
import { getOcticonComponent } from "../project-octicon-registry.js";
import { DefaultProjectIcon } from "./default-project-icon.js";

export type ProjectOcticonProps = {
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

type DisplayEntityIcon = {
  /** Octicon key or emoji glyph to render — null means "use the default icon". */
  display: string | null;
  /** Paint color from a `{"t":"i"|"d","c":"#..."}` JSON payload, if present. */
  color?: string;
};

function parseDisplayEntityIcon(
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

/** Strip Next entity-icon JSON / emoji payloads down to an octicon key when possible. */
export function getDisplayProjectIcon(
  icon: string | null | undefined,
): string | null {
  return parseDisplayEntityIcon(icon).display;
}

/** Extract the paint color from a serialized entity icon JSON payload, if any. */
export function getEntityIconColor(
  icon: string | null | undefined,
): string | undefined {
  return parseDisplayEntityIcon(icon).color;
}

function resolveOcticonComponent(key: string): OcticonComponent | null {
  if (!isProjectIconKey(key)) {
    return null;
  }
  return getOcticonComponent(key) as OcticonComponent | null;
}

/**
 * Project glyph — Primer octicon by key, emoji passthrough, else DefaultProjectIcon.
 * Uses an explicit import registry so Turbopack/webpack cannot tree-shake icons away.
 */
export function ProjectOcticon({
  icon,
  size = 16,
  className,
  title,
  style,
}: ProjectOcticonProps) {
  const { display, color } = parseDisplayEntityIcon(icon);
  const colorStyle: CSSProperties | undefined = color
    ? { color, ...style }
    : style;

  if (!display) {
    return (
      <DefaultProjectIcon size={size} className={className} style={colorStyle} />
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

  return (
    <DefaultProjectIcon size={size} className={className} style={colorStyle} />
  );
}
