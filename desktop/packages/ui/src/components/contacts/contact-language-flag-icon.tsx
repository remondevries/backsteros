"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { ContactLanguage } from "@backsteros/contracts";

export type ContactLanguageFlagIconProps = {
  code: ContactLanguage;
  size?: number;
  className?: string;
};

/** UK flag art clipped to a circle inside a locked square box. */
function FlagEnSvg({ size, clipId }: { size: number; clipId: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="16" cy="16" r="16" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="32" height="32" fill="#071b65" />
        <path
          d="M5.101,4h-.101c-1.981,0-3.615,1.444-3.933,3.334L26.899,28h.101c1.981,0,3.615-1.444,3.933-3.334L5.101,4Z"
          fill="#fff"
        />
        <path
          d="M22.25,19h-2.5l9.934,7.947c.387-.353,.704-.777,.929-1.257l-8.363-6.691Z"
          fill="#b92932"
        />
        <path
          d="M1.387,6.309l8.363,6.691h2.5L2.316,5.053c-.387,.353-.704,.777-.929,1.257Z"
          fill="#b92932"
        />
        <path
          d="M5,28h.101L30.933,7.334c-.318-1.891-1.952-3.334-3.933-3.334h-.101L1.067,24.666c.318,1.891,1.952,3.334,3.933,3.334Z"
          fill="#fff"
        />
        <rect x="13" y="4" width="6" height="24" fill="#fff" />
        <rect x="1" y="13" width="30" height="6" fill="#fff" />
        <rect x="14" y="4" width="4" height="24" fill="#b92932" />
        <rect
          x="14"
          y="1"
          width="4"
          height="30"
          transform="translate(32) rotate(90)"
          fill="#b92932"
        />
        <path
          d="M28.222,4.21l-9.222,7.376v1.414h.75l9.943-7.94c-.419-.384-.918-.671-1.471-.85Z"
          fill="#b92932"
        />
        <path
          d="M2.328,26.957c.414,.374,.904,.656,1.447,.832l9.225-7.38v-1.408h-.75L2.328,26.957Z"
          fill="#b92932"
        />
      </g>
    </svg>
  );
}

function flagBackground(code: ContactLanguage): string | null {
  switch (code) {
    case "nl":
      return "linear-gradient(to bottom,#a1292a 0 33.333%,#fff 33.333% 66.666%,#264387 66.666% 100%)";
    case "de":
      return "linear-gradient(to bottom,#000 0 33.333%,#cc2b1d 33.333% 66.666%,#f8d147 66.666% 100%)";
    case "es":
      return "linear-gradient(to bottom,#aa151b 0 25%,#f1bf00 25% 75%,#aa151b 75% 100%)";
    case "fr":
      return "linear-gradient(to right,#002395 0 33.333%,#fff 33.333% 66.666%,#ed2939 66.666% 100%)";
    case "pl":
      return "linear-gradient(to bottom,#fff 0 50%,#cb2e40 50% 100%)";
    case "en":
      return null;
  }
}

/**
 * Circular language flag badge.
 * Tricolors are CSS gradients on a locked square (same idea as EntityListAvatar)
 * so flex layout cannot squash them into flag-shaped ovals.
 */
export function ContactLanguageFlagIcon({
  code,
  size = 14,
  className = "",
}: ContactLanguageFlagIconProps) {
  const clipId = `contact-lang-en-${useId().replace(/:/g, "")}`;
  const background = flagBackground(code);

  const box: CSSProperties = {
    display: "inline-block",
    boxSizing: "border-box",
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    maxWidth: size,
    maxHeight: size,
    flexShrink: 0,
    flexGrow: 0,
    flexBasis: size,
    alignSelf: "center",
    borderRadius: 9999,
    overflow: "hidden",
    lineHeight: 0,
    verticalAlign: "middle",
    background: background ?? undefined,
  };

  let media: ReactNode = null;
  if (code === "en") {
    media = <FlagEnSvg size={size} clipId={clipId} />;
  }

  return (
    <span
      className={["contact-language-flag-icon", className]
        .filter(Boolean)
        .join(" ")}
      style={box}
      aria-hidden="true"
    >
      {media}
    </span>
  );
}
