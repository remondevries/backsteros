import type { CSSProperties } from "react";

import { CustomProjectIcon, hasCustomProjectIcon } from "./custom-project-icons";
import { DefaultProjectIcon } from "./DefaultProjectIcon";
import {
  isEmojiProjectIconDisplay,
  migrateLegacyProjectType,
  parseDisplayEntityIcon,
} from "./project-display-icon";
import { hasPrimerOcticonCandidate, PrimerOcticon } from "./PrimerOcticon";
import { TerminalConsoleIcon } from "./TerminalConsoleIcon";

export type ProjectOcticonProps = {
  icon: string | null | undefined;
  /**
   * When set and the project has no custom icon, codebase projects use the
   * terminal glyph instead of the default project mark.
   */
  type?: string | null;
  size?: number;
  className?: string | undefined;
  title?: string;
  style?: CSSProperties;
};

function DefaultGlyphForType({
  type,
  size,
  className,
  style,
}: {
  type: string | null | undefined;
  size: number;
  className?: string | undefined;
  style?: CSSProperties;
}) {
  if (migrateLegacyProjectType(type) === "codebase") {
    return (
      <TerminalConsoleIcon
        size={size}
        {...(className != null ? { className } : {})}
        {...(style != null ? { style } : {})}
      />
    );
  }
  return (
    <DefaultProjectIcon
      size={size}
      {...(className != null ? { className } : {})}
      {...(style != null ? { style } : {})}
    />
  );
}

/**
 * Project glyph — custom desktop icons, emoji, Primer (lazy JSON fetch), else
 * type default. Primer data is loaded via `?url` + fetch so Vite does not
 * inline a multi‑MB JS module into the Electron protocol graph.
 */
export function ProjectOcticon({
  icon,
  type,
  size = 16,
  className,
  title,
  style,
}: ProjectOcticonProps) {
  const { display, color } = parseDisplayEntityIcon(icon);
  const colorStyle: CSSProperties | undefined = color ? { color, ...style } : style;
  const sharedClassProps = className != null ? { className } : {};
  const sharedStyleProps = colorStyle != null ? { style: colorStyle } : {};

  if (!display) {
    return (
      <DefaultGlyphForType type={type} size={size} {...sharedClassProps} {...sharedStyleProps} />
    );
  }

  if (isEmojiProjectIconDisplay(display)) {
    return (
      <span
        {...sharedClassProps}
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

  if (display === "terminal") {
    return <TerminalConsoleIcon size={size} {...sharedClassProps} {...sharedStyleProps} />;
  }

  if (hasCustomProjectIcon(display)) {
    return (
      <CustomProjectIcon name={display} size={size} {...sharedClassProps} {...sharedStyleProps} />
    );
  }

  if (hasPrimerOcticonCandidate(display)) {
    return (
      <PrimerOcticon
        name={display}
        size={size}
        {...sharedClassProps}
        {...sharedStyleProps}
        {...(title != null ? { title } : {})}
        fallback={
          <DefaultGlyphForType
            type={type}
            size={size}
            {...sharedClassProps}
            {...sharedStyleProps}
          />
        }
      />
    );
  }

  return (
    <DefaultGlyphForType type={type} size={size} {...sharedClassProps} {...sharedStyleProps} />
  );
}
