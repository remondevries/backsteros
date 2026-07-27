import Svg, { Path, Rect } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
};

/**
 * Terminal mark used as the codebase project default glyph
 * (parity with desktop `TerminalConsoleIcon`, simplified for RN without mask).
 */
export function TerminalConsoleIcon({
  size = 16,
  color = colors.foreground,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x="1" y="1" width="14" height="14" rx="4" fill={color} />
      <Path
        d="M4 12L7 9L4 6"
        stroke={colors.background}
        strokeWidth="1.33333"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M9 11H12"
        stroke={colors.background}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}
