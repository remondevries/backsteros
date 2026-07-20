import Svg, { Circle, Path } from "react-native-svg";

import { colors } from "../lib/theme";

/** Circle-style + in a circle for the properties meta card. */
export function DetailPropertiesCirclePlusIcon({
  size = 16,
  color = colors.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityElementsHidden>
      <Circle
        cx={8}
        cy={8}
        r={6.25}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
      />
      <Path
        d="M8 5.25V10.75M5.25 8H10.75"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    </Svg>
  );
}
