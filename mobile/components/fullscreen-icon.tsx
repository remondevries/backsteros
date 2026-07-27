import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
  /** When true, shows the “exit fullscreen” (compress) glyph. */
  exit?: boolean;
};

/** Expand / compress corners — matches common fullscreen affordance. */
export function FullscreenIcon({
  size = 20,
  color = colors.foreground,
  exit = false,
}: Props) {
  if (exit) {
    return (
      <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <Path
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.5 1.5v3h-3M10.5 1.5v3h3M5.5 14.5v-3h-3M10.5 14.5v-3h3"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 5.5v-3h3M13.5 5.5v-3h-3M2.5 10.5v3h3M13.5 10.5v3h-3"
      />
    </Svg>
  );
}
