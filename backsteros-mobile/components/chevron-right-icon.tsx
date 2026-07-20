import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
};

/** Chevron right — matches desktop property navigate affordance. */
export function ChevronRightIcon({
  size = 14,
  color = colors.muted,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
        fill={color}
      />
    </Svg>
  );
}
