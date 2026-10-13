"use client";

import type { ReactNode } from "react";

import {
  normalizeSocialPlatform,
  type SocialPlatformId,
} from "../../social/social-contacts.js";
import { InstagramIcon } from "../icons/instagram-icon.js";
import { GlobeIcon } from "../icons/globe-icon.js";

type SocialPlatformIconProps = {
  platform: string;
  size?: number;
  className?: string;
};

function LinkedInGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14.25 1H1.75C1.336 1 1 1.336 1 1.75v12.5c0 .414.336.75.75.75h12.5c.414 0 .75-.336.75-.75V1.75c0-.414-.336-.75-.75-.75ZM5.338 12.338H3.413V6.413h1.925v5.925ZM4.375 5.55a1.113 1.113 0 1 1 0-2.225 1.113 1.113 0 0 1 0 2.225Zm8.213 6.788h-1.925V9.3c0-.725-.014-1.656-1.01-1.656-.999 0-1.152.78-1.152 1.606v3.088H6.576V6.413h1.847v.81h.026c.257-.486.885-1 1.822-1 1.95 0 2.317 1.284 2.317 2.953v2.162Z" />
    </svg>
  );
}

function XGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.6 1.25h2.247l-4.913 5.615L16 14.75h-4.937l-3.867-5.056-4.425 5.056H.52l5.254-6.004L0 1.25h5.063l3.495 4.625L12.6 1.25Zm-.789 12.106h1.245L4.255 2.52H2.92l8.891 10.836Z" />
    </svg>
  );
}

function InstagramGlyph({ size }: { size: number }) {
  return <InstagramIcon size={size} />;
}

function GitHubGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  );
}

function WebsiteGlyph({ size }: { size: number }) {
  return <GlobeIcon size={size} />;
}

function OtherGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 12.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm0-3.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5ZM8 6a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 8 6Z" />
    </svg>
  );
}

const GLYPHS: Record<
  SocialPlatformId,
  (props: { size: number }) => ReactNode
> = {
  linkedin: LinkedInGlyph,
  x: XGlyph,
  instagram: InstagramGlyph,
  github: GitHubGlyph,
  website: WebsiteGlyph,
  other: OtherGlyph,
};

export function SocialPlatformIcon({
  platform,
  size = 14,
  className,
}: SocialPlatformIconProps) {
  const id = normalizeSocialPlatform(platform);
  const Glyph = GLYPHS[id];
  return (
    <span
      className={[
        "social-platform-icon",
        `social-platform-icon--${id}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-platform={id}
      aria-hidden="true"
    >
      <Glyph size={size} />
    </span>
  );
}
