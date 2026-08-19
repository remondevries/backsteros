import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  color?: string;
  size?: number;
};

/** Classic funnel / filter glyph for list filter headers. */
export function FilterIcon({
  color = colors.foreground,
  size = 18,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.5 2.75A.75.75 0 0 1 2.25 2h11.5a.75.75 0 0 1 .55 1.26L9.5 8.56v4.19a.75.75 0 0 1-1.17.62l-2-1.25A.75.75 0 0 1 6 11.5V8.56L1.7 3.26A.75.75 0 0 1 1.5 2.75Zm2.14.75 3.66 4.58a.75.75 0 0 1 .2.49v2.6l.5.31V8.57a.75.75 0 0 1 .2-.49l3.66-4.58H3.64Z"
      />
    </Svg>
  );
}
