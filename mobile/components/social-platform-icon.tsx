import type { ReactElement } from "react";
import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";
import {
  normalizeSocialPlatform,
  type SocialPlatformId,
} from "../lib/social-contacts";

type Props = {
  platform: string;
  size?: number;
  color?: string;
};

function glyph(
  id: SocialPlatformId,
  size: number,
  color: string,
): ReactElement {
  switch (id) {
    case "linkedin":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <Path d="M14.25 1H1.75C1.336 1 1 1.336 1 1.75v12.5c0 .414.336.75.75.75h12.5c.414 0 .75-.336.75-.75V1.75c0-.414-.336-.75-.75-.75ZM5.338 12.338H3.413V6.413h1.925v5.925ZM4.375 5.55a1.113 1.113 0 1 1 0-2.225 1.113 1.113 0 0 1 0 2.225Zm8.213 6.788h-1.925V9.3c0-.725-.014-1.656-1.01-1.656-.999 0-1.152.78-1.152 1.606v3.088H6.576V6.413h1.847v.81h.026c.257-.486.885-1 1.822-1 1.95 0 2.317 1.284 2.317 2.953v2.162Z" />
        </Svg>
      );
    case "x":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <Path d="M12.6 1.25h2.247l-4.913 5.615L16 14.75h-4.937l-3.867-5.056-4.425 5.056H.52l5.254-6.004L0 1.25h5.063l3.495 4.625L12.6 1.25Zm-.789 12.106h1.245L4.255 2.52H2.92l8.891 10.836Z" />
        </Svg>
      );
    case "instagram":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <Path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm5.25-.875a.875.875 0 1 1-1.75 0 .875.875 0 0 1 1.75 0ZM4.5 1.25h7A3.25 3.25 0 0 1 14.75 4.5v7a3.25 3.25 0 0 1-3.25 3.25h-7A3.25 3.25 0 0 1 1.25 11.5v-7A3.25 3.25 0 0 1 4.5 1.25Zm0 1.5A1.75 1.75 0 0 0 2.75 4.5v7c0 .966.784 1.75 1.75 1.75h7A1.75 1.75 0 0 0 13.25 11.5v-7A1.75 1.75 0 0 0 11.5 2.75h-7Z" />
        </Svg>
      );
    case "github":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <Path
            fillRule="evenodd"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </Svg>
      );
    case "website":
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <Path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM2.5 8a5.5 5.5 0 0 1 .64-2.56l1.74 1.74A2 2 0 0 0 6 9.5v.17l-2.36 2.36A5.48 5.48 0 0 1 2.5 8Zm3.06 4.44 2.36-2.36h.17a2 2 0 0 0 1.82-1.12l1.74 1.74A5.5 5.5 0 0 1 5.56 12.44Zm5.88-2.82-1.74-1.74A2 2 0 0 0 10 6.5V6.33l2.36-2.36A5.48 5.48 0 0 1 13.5 8a5.48 5.48 0 0 1-2.06 4.22l-.5-.5.5-.1ZM11.44 3.56 9.08 5.92V6.1a2 2 0 0 0-1.12 1.82L6.22 6.18A5.5 5.5 0 0 1 11.44 3.56Z" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
          <Path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM3 8a5 5 0 1 1 10 0A5 5 0 0 1 3 8Z" />
        </Svg>
      );
  }
}

/** Compact platform glyph for social list/detail (desktop parity). */
export function SocialPlatformIcon({
  platform,
  size = 16,
  color = colors.foreground,
}: Props) {
  return glyph(normalizeSocialPlatform(platform), size, color);
}
