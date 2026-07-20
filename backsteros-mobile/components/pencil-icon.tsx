import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
};

/** Simple pencil glyph for edit / reupload affordances. */
export function PencilIcon({ size = 16, color = colors.foreground }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M11.146 2.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-8.5 8.5a.5.5 0 0 1-.168.11l-3 1a.5.5 0 0 1-.632-.632l1-3a.5.5 0 0 1 .11-.168l8.5-8.5ZM12 3.207 4.56 10.646l-.707 2.121 2.121-.707L13.793 4 12 3.207Z"
        fill={color}
      />
    </Svg>
  );
}
