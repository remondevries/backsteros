import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
};

/** Solid plus — matches desktop letter PDF dock upload control. */
export function PlusIcon({
  size = 22,
  color = colors.foreground,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        fill={color}
        d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"
      />
    </Svg>
  );
}
