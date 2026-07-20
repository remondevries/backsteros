import Svg, { Circle } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
};

/** Horizontal three-dot (⋯) menu affordance. */
export function MoreHorizontalIcon({
  size = 16,
  color = colors.foreground,
}: Props) {
  const r = 1.35;
  const cy = 8;
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={3.5} cy={cy} r={r} fill={color} />
      <Circle cx={8} cy={cy} r={r} fill={color} />
      <Circle cx={12.5} cy={cy} r={r} fill={color} />
    </Svg>
  );
}
