import Svg, { Path } from "react-native-svg";

import { colors } from "../lib/theme";

type Props = {
  size?: number;
  color?: string;
};

/** Same path as desktop codebase `FileIcon` in the working-directory tree. */
export function FileIcon({ size = 14, color = colors.foreground }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        fill={color}
        d="M2.75 1A1.75 1.75 0 0 0 1 2.75v10.5C1 14.216 1.784 15 2.75 15h10.5A1.75 1.75 0 0 0 15 13.25V6.5a.75.75 0 0 0-.22-.53l-4.75-4.75A.75.75 0 0 0 9.5 1H2.75Zm6.75 1.56L13.44 6.5H10.25A.75.75 0 0 1 9.5 5.75V2.56Z"
      />
    </Svg>
  );
}
